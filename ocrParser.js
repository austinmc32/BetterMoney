/**
 * OCRParser - Extracts transaction data from images and PDFs using OCR
 * Includes user feedback system for transaction verification
 */
class OCRParser {
    constructor() {
        this.supportedFormats = ['pdf', 'jpg', 'jpeg', 'png', 'bmp', 'gif'];
        this.worker = null;
        this.isInitialized = false;
        this.pdfjsLib = window.pdfjsLib;
        this.progressCallback = null;
        
        // Add pattern memory to improve over time
        this.knownPatterns = {};
        this.userCorrections = [];
        
        // Try to load saved patterns from localStorage
        this.loadSavedPatterns();
    }

    /**
     * Initialize OCR engine
     */
    async initialize() {
        if (!this.isInitialized) {
            console.log('Initializing OCR engine...');
            
            // Initialize Tesseract OCR worker
            this.worker = await Tesseract.createWorker({
                logger: progress => {
                    if (this.progressCallback) {
                        this.progressCallback({
                            status: progress.status,
                            progress: progress.progress || 0,
                            message: `OCR Processing: ${progress.status}`
                        });
                    }
                }
            });
            
            // Set language and configuration optimized for numbers and text in tables
            await this.worker.loadLanguage('eng');
            await this.worker.initialize('eng');
            await this.worker.setParameters({
                tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,;:$-+/()%&*"\'!? ',
                preserve_interword_spaces: '1'
            });
            
            // Initialize PDF.js if needed
            if (this.pdfjsLib) {
                this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';
            }
            
            this.isInitialized = true;
            console.log('OCR engine initialized successfully');
        }
    }

    /**
     * Set a callback for progress updates
     * @param {Function} callback - Function that takes a progress object
     */
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    /**
     * Parse a file using OCR with user verification
     * @param {File} file - The file to parse (PDF or image)
     * @param {Function} [verificationCallback] - Optional callback for user verification of transactions
     * @returns {Promise<{transactions: Array, text: string, needsReview: Array}>} Parsed data
     */
    async parseFile(file, verificationCallback = null) {
        await this.initialize();
        
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        if (!this.supportedFormats.includes(fileExtension)) {
            throw new Error(`Unsupported file format: ${fileExtension}`);
        }
        
        this.updateProgress({
            status: 'starting',
            progress: 0,
            message: 'Starting extraction...'
        });
        
        let extractedText = '';
        
        if (fileExtension === 'pdf') {
            extractedText = await this.processPDF(file);
        } else {
            extractedText = await this.processImage(file);
        }
        
        this.updateProgress({
            status: 'analyzing',
            progress: 0.9,
            message: 'Analyzing extracted text...'
        });
        
        // First-pass extraction with confidence scoring
        const { transactions, needsReview } = this.extractTransactionsWithConfidence(extractedText);
        
        // If a verification callback is provided, use it for user verification
        if (verificationCallback && needsReview.length > 0) {
            await verificationCallback(needsReview, this.applyUserCorrections.bind(this));
        }
        
        this.updateProgress({
            status: 'complete',
            progress: 1.0,
            message: 'Processing complete!'
        });
        
        return {
            transactions,
            text: extractedText,
            needsReview
        };
    }

    /**
     * Update progress with callback if available
     * @param {Object} progress - Progress information
     */
    updateProgress(progress) {
        if (this.progressCallback) {
            this.progressCallback(progress);
        }
    }

    /**
     * Process a PDF file using OCR
     * @param {File} file - The PDF file
     * @returns {Promise<string>} Extracted text
     */
    async processPDF(file) {
        if (!this.pdfjsLib) {
            throw new Error('PDF.js library not available');
        }
        
        // Convert file to ArrayBuffer for PDF.js
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await this.pdfjsLib.getDocument(arrayBuffer).promise;
        
        let allText = '';
        
        // Process each page
        for (let i = 1; i <= pdf.numPages; i++) {
            this.updateProgress({
                status: 'processing_pdf',
                progress: (i - 1) / pdf.numPages,
                message: `Processing PDF page ${i} of ${pdf.numPages}`
            });
            
            // Get the page
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
            
            // Create a canvas for rendering
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Render PDF page to canvas
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            // Perform OCR on the rendered image
            const { data: { text } } = await this.worker.recognize(canvas);
            allText += text + '\n';
            
            // Clean up
            canvas.remove();
        }
        
        return allText;
    }

    /**
     * Process an image file using OCR
     * @param {File} file - The image file
     * @returns {Promise<string>} Extracted text
     */
    async processImage(file) {
        this.updateProgress({
            status: 'processing_image',
            progress: 0.3,
            message: 'Processing image...'
        });
        
        const { data: { text } } = await this.worker.recognize(file);
        return text;
    }

    /**
     * Store the last extraction results for reference
     * @private
     */
    _lastResults = null;

    /**
     * Extract transactions with confidence scores to flag uncertain ones
     * @param {string} text - OCR extracted text
     * @returns {Object} Transactions and items needing review
     */
    extractTransactionsWithConfidence(text) {
        const transactions = [];
        const needsReview = [];
        
        // Split text into lines
        let lines = text.split('\n')
            .map(line => line.trim().replace(/\s{2,}/g, ' '))
            .filter(line => line !== '');
        
        // Define patterns
        const datePattern = /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12][0-9]|3[01])\b/;
        const isoDatePattern = /^\d{4}-\d{2}-\d{2}/; // For YYYY-MM-DD dates
        
        // Enhanced amount pattern to handle OCR errors (colons instead of periods)
        const amountPattern = /-?\$?[\d,]+[.:]\d{2}/g;
        
        // Pattern to detect two monetary amounts at the end of a line (transaction amount and balance)
        // This pattern handles both normal decimal points and OCR errors with colons
        const dualAmountPattern = /(-?\$?[\d,]+[.:]\d{2})\s+([\d,]+[.:]\d{2})$/;
        
        // Skip patterns - enhance to catch more summary lines
        const skipPatterns = [
            /^\s*ending balance\b/i,
            /\bending balance\b/i,    // Match "Ending Balance" anywhere in the line
            /^\s*beginning balance\b/i,
            /\bbeginning balance\b/i, // Match "Beginning Balance" anywhere in the line
            /\byear-to-date summary\b/i,
            /\bannual percentage\b/i,
            /\bstatement period\b/i,
            /\baccount number\b/i,
            /\bpage \d+ of \d+\b/i,
            /^date\s+transaction description\s+amount\s+balance/i,
            /^\s*total dividend of\b/i,
            /^a payment of/i,
        ];
        
        // Summary line keywords to match regardless of position
        const summaryKeywords = ['ending balance', 'beginning balance', 'statement total'];
        
        const currentYear = new Date().getFullYear();
        let currentTransaction = null;
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            
            // Check for summary lines first
            let isSummaryLine = skipPatterns.some(pattern => pattern.test(line));
            
            // Also check for date-prefixed summary lines (e.g. "2025-03-30 Ending Balance")
            if (!isSummaryLine && (datePattern.test(line) || isoDatePattern.test(line))) {
                const lowerLine = line.toLowerCase();
                if (summaryKeywords.some(keyword => lowerLine.includes(keyword))) {
                    isSummaryLine = true;
                    console.log(`Skipping summary line with date: "${line}"`);
                }
            }
            
            // Skip header/footer/summary lines
            if (isSummaryLine) {
                if (currentTransaction) {
                    const finalized = this.finalizeTransaction(currentTransaction);
                    this.assignConfidenceScore(finalized);
                    
                    if (finalized.confidence < 0.7) {
                        needsReview.push(finalized);
                    } else {
                        transactions.push(finalized);
                    }
                    currentTransaction = null;
                }
                continue;
            }
            
            const dateMatch = line.match(datePattern);
            const dualAmountMatch = line.match(dualAmountPattern);
            const allAmounts = line.match(amountPattern);
            let isLikelyContinuation = false;
            
            // Check if line starts a new transaction
            if (dateMatch && allAmounts && allAmounts.length > 0) {
                // Finalize previous transaction if exists
                if (currentTransaction) {
                    const finalized = this.finalizeTransaction(currentTransaction);
                    this.assignConfidenceScore(finalized);
                    
                    if (finalized.confidence < 0.7) {
                        needsReview.push(finalized);
                    } else {
                        transactions.push(finalized);
                    }
                }
                
                // Initialize new transaction
                const month = dateMatch[1].padStart(2, '0');
                const day = dateMatch[2].padStart(2, '0');
                const date = `${currentYear}-${month}-${day}`;
                
                let amount = 0;
                let confidence = 0.5; // Start with moderate confidence
                let description = line.replace(datePattern, '').trim();
                
                // IMPROVED AMOUNT DETECTION LOGIC
                if (dualAmountMatch) {
                    // The first amount is typically the transaction amount, second is balance
                    // Fix OCR errors in amount (replace colons with periods)
                    const transactionAmount = dualAmountMatch[1].replace(':', '.');
                    amount = this.parseAmount(transactionAmount);
                    confidence += 0.3; // Higher confidence for dual-amount format
                    
                    // Remove the amounts from description
                    description = description.replace(dualAmountMatch[0], '').trim();
                    
                    // Log for debugging
                    console.log(`Found dual amounts: Trans=${transactionAmount}, Balance=${dualAmountMatch[2].replace(':', '.')}`);
                } else if (allAmounts.length > 1) {
                    // If multiple amounts but not in the expected pattern at the end,
                    // use the penultimate amount as the transaction amount
                    const transactionAmount = allAmounts[allAmounts.length - 2].replace(':', '.');
                    amount = this.parseAmount(transactionAmount);
                    confidence += 0.1;
                    
                    // Try to remove all amounts from description
                    allAmounts.forEach(amt => {
                        description = description.replace(amt, '').trim();
                    });
                } else if (allAmounts.length === 1) {
                    // Only one amount found
                    const singleAmount = allAmounts[0].replace(':', '.');
                    amount = this.parseAmount(singleAmount);
                    description = description.replace(allAmounts[0], '').trim();
                }
                
                // Create transaction with corrected amount sign
                currentTransaction = {
                    date,
                    descriptionParts: [description.trim()],
                    amount,
                    rawLine: line,
                    confidence,
                    original: {
                        line,
                        date: dateMatch[0],
                        amounts: allAmounts ? allAmounts.map(amt => amt.replace(':', '.')) : []
                    }
                };
                
                // Check for known patterns to improve confidence
                if (this.matchesKnownPattern(currentTransaction)) {
                    currentTransaction.confidence += 0.2;
                }
            }
            // Check if line is continuation of current transaction
            else if (!dateMatch && currentTransaction) {
                if (!dualAmountPattern.test(line) && !/^\d+\/\d+/.test(line)) {
                    currentTransaction.descriptionParts.push(line);
                    isLikelyContinuation = true;
                    
                    // Check if this matches a previously seen continuation pattern
                    if (this.isKnownContinuationPattern(line)) {
                        currentTransaction.confidence += 0.1;
                    } else {
                        currentTransaction.confidence -= 0.05; // Slightly reduce confidence for uncertain continuation
                    }
                }
            }
            
            // Handle non-transaction lines
            if (!dateMatch && !isLikelyContinuation && currentTransaction) {
                const finalized = this.finalizeTransaction(currentTransaction);
                this.assignConfidenceScore(finalized);
                
                if (finalized.confidence < 0.7) {
                    needsReview.push(finalized);
                } else {
                    transactions.push(finalized);
                }
                currentTransaction = null;
            }
        }
        
        // Process the last transaction if it exists
        if (currentTransaction) {
            const finalized = this.finalizeTransaction(currentTransaction);
            this.assignConfidenceScore(finalized);
            
            if (finalized.confidence < 0.7) {
                needsReview.push(finalized);
            } else {
                transactions.push(finalized);
            }
        }
        
        // Store the results for later reference
        this._lastResults = [...transactions];
        
        return { transactions, needsReview };
    }

    /**
     * Get the results from the last parsing operation
     * @returns {Array} Array of transaction objects
     */
    getLastResults() {
        return this._lastResults || [];
    }

    /**
     * Finalize transaction with improved cleaning and type detection
     * @param {Object} txData - Transaction data to finalize
     * @returns {Object} Finalized transaction
     */
    finalizeTransaction(txData) {
        if (!txData) return null;
        
        // Join description parts with smart joining
        let description = txData.descriptionParts.join(' ').trim();
        description = description.replace(/\s{2,}/g, ' ');
        
        const amount = txData.amount;
        const type = amount < 0 ? 'expense' : 'income';
        
        // Clean description more thoroughly
        const typePrefixes = [
            'DEBIT CARD WITHDRAWAL',
            'CREDIT CARD PAYMENT',
            'EFT',
            'ACH',
            'DIVIDEND',
            'SELF SERVICE TRANSFER',
            'VENMO'
        ];
        
        for (const prefix of typePrefixes) {
            if (description.toUpperCase().startsWith(prefix + ' ')) {
                description = description.substring(prefix.length).trim();
                break;
            }
        }
        
        // Try to remove duplicate merchant names
        // Example: "GOOGLE *Youtube 5815 CA Mountain View GOOGLE *Youtube US"
        this.cleanDuplicateMerchantNames(description);
        
        // Create final transaction object
        const finalTx = {
            date: txData.date,
            description: description,
            amount: Math.abs(amount),
            type: type,
            rawAmount: amount,
            confidence: txData.confidence || 0.5,
            original: txData.original || null
        };
        
        // Flag large transactions
        if (finalTx.amount > 1000) {
            finalTx.disputed = true;
            finalTx.confidence -= 0.1; // Reduce confidence for large amounts
        }
        
        return finalTx;
    }

    /**
     * Assign a confidence score to a transaction based on various factors
     * @param {Object} transaction - Transaction to score
     */
    assignConfidenceScore(transaction) {
        if (!transaction) return;
        
        let score = transaction.confidence || 0.5;
        
        // Add additional confidence factors
        // 1. Description quality
        if (transaction.description.length > 5 && transaction.description.length < 100) {
            score += 0.1; // Reasonable description length
        } else {
            score -= 0.1; // Too short or too long
        }
        
        // 2. Date quality
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (dateRegex.test(transaction.date)) {
            score += 0.1;
        } else {
            score -= 0.2;
        }
        
        // 3. Amount reasonableness
        if (transaction.amount > 0 && transaction.amount < 10000) {
            score += 0.1; // Reasonable amount
        } else if (transaction.amount === 0) {
            score -= 0.3; // Zero amount is suspicious
        }
        
        // Apply previous corrections factor
        if (this.hasBeenCorrectedBefore(transaction)) {
            score -= 0.2; // Reduce confidence for previously corrected similar transactions
        }
        
        // Cap score between 0 and 1
        transaction.confidence = Math.max(0, Math.min(1, score));
    }

    /**
     * Apply user corrections to a transaction and learn from them
     * @param {Array} correctedTransactions - Array of user-corrected transactions
     */
    applyUserCorrections(correctedTransactions) {
        if (!correctedTransactions || !Array.isArray(correctedTransactions)) {
            return;
        }
        
        correctedTransactions.forEach(tx => {
            if (!tx.original) return;
            
            // Store the correction pattern
            const pattern = {
                dateFormat: tx.original.date,
                originalLine: tx.original.line,
                correctedDate: tx.date,
                correctedDescription: tx.description,
                correctedAmount: tx.amount,
                correctedType: tx.type
            };
            
            this.userCorrections.push(pattern);
            
            // Update known patterns based on this correction
            this.updateKnownPatterns(pattern);
        });
        
        // Save patterns to localStorage
        this.savePatterns();
    }

    /**
     * Check if a transaction matches a known pattern
     * @param {Object} transaction - Transaction to check
     * @returns {boolean} True if matches a known pattern
     */
    matchesKnownPattern(transaction) {
        // Implementation would check against stored patterns
        if (!transaction || !transaction.rawLine) return false;
        
        const merchantMatch = this.extractMerchantName(transaction.descriptionParts[0]);
        if (!merchantMatch) return false;
        
        // Check if we've seen this merchant before
        return !!this.knownPatterns[merchantMatch];
    }

    /**
     * Check if a line matches a known continuation pattern
     * @param {string} line - Line to check
     * @returns {boolean} True if matches a known continuation pattern
     */
    isKnownContinuationPattern(line) {
        // Check for common continuation patterns
        const continuationPatterns = [
            /^[A-Z]{2}\s/, // State abbreviation
            /US$/,        // Ends with US
            /^FROM/,      // Transfer reference
            /\.com/       // Website
        ];
        
        return continuationPatterns.some(pattern => pattern.test(line));
    }

    /**
     * Check if a similar transaction has been corrected before
     * @param {Object} transaction - Transaction to check
     * @returns {boolean} True if a similar transaction has been corrected
     */
    hasBeenCorrectedBefore(transaction) {
        if (!transaction || !this.userCorrections.length) return false;
        
        const merchantName = this.extractMerchantName(transaction.description);
        if (!merchantName) return false;
        
        return this.userCorrections.some(correction => 
            correction.correctedDescription.includes(merchantName));
    }

    /**
     * Extract merchant name from description
     * @param {string} description - Transaction description
     * @returns {string|null} Extracted merchant name or null
     */
    extractMerchantName(description) {
        if (!description) return null;
        
        // Look for common merchant patterns
        // 1. ALL CAPS words at the start
        const capsMatch = description.match(/^([A-Z][A-Z\s'&-]+)/);
        if (capsMatch) return capsMatch[1].trim();
        
        // 2. Words before numbers (often category codes)
        const beforeNumbersMatch = description.match(/^([^0-9]+)(?=\s+\d)/);
        if (beforeNumbersMatch) return beforeNumbersMatch[1].trim();
        
        // 3. Words before common locations
        const beforeLocationMatch = description.match(/^(.+?)(?=\s+[A-Z]{2}\s)/);
        if (beforeLocationMatch) return beforeLocationMatch[1].trim();
        
        return null;
    }

    /**
     * Clean duplicate merchant names from description
     * @param {string} description - Description to clean
     * @returns {string} Cleaned description
     */
    cleanDuplicateMerchantNames(description) {
        if (!description) return description;
        
        const merchantName = this.extractMerchantName(description);
        if (!merchantName || merchantName.length < 4) return description;
        
        // Look for the same merchant name later in the description
        const escapedName = merchantName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const duplicateRegex = new RegExp(`\\b${escapedName}\\b`, 'gi');
        
        let matches = [...description.matchAll(duplicateRegex)];
        if (matches.length > 1) {
            // Keep first occurrence, remove others
            let cleaned = description;
            for (let i = 1; i < matches.length; i++) {
                cleaned = cleaned.replace(matches[i][0], '');
            }
            return cleaned.replace(/\s{2,}/g, ' ').trim();
        }
        
        return description;
    }

    /**
     * Update known patterns based on a correction
     * @param {Object} pattern - Correction pattern
     */
    updateKnownPatterns(pattern) {
        const merchantName = this.extractMerchantName(pattern.correctedDescription);
        if (!merchantName) return;
        
        if (!this.knownPatterns[merchantName]) {
            this.knownPatterns[merchantName] = {
                count: 0,
                amounts: [],
                type: null
            };
        }
        
        const entry = this.knownPatterns[merchantName];
        entry.count++;
        entry.amounts.push(pattern.correctedAmount);
        
        // If we see the same type consistently, remember it
        if (entry.count > 2) {
            const expenseCount = entry.amounts.filter(a => a < 0).length;
            const incomeCount = entry.amounts.filter(a => a > 0).length;
            
            if (expenseCount > incomeCount * 2) {
                entry.type = 'expense';
            } else if (incomeCount > expenseCount * 2) {
                entry.type = 'income';
            }
        }
    }

    /**
     * Save patterns to localStorage
     */
    savePatterns() {
        try {
            localStorage.setItem('ocrParserPatterns', JSON.stringify(this.knownPatterns));
            localStorage.setItem('ocrParserCorrections', JSON.stringify(this.userCorrections));
        } catch (e) {
            console.warn('Could not save parser patterns to localStorage:', e);
        }
    }

    /**
     * Load saved patterns from localStorage
     */
    loadSavedPatterns() {
        try {
            const patterns = localStorage.getItem('ocrParserPatterns');
            const corrections = localStorage.getItem('ocrParserCorrections');
            
            if (patterns) {
                this.knownPatterns = JSON.parse(patterns);
            }
            
            if (corrections) {
                this.userCorrections = JSON.parse(corrections);
            }
        } catch (e) {
            console.warn('Could not load parser patterns from localStorage:', e);
        }
    }

    /**
     * Standardize date formats to YYYY-MM-DD
     * @param {string} dateStr - Date string in various formats
     * @returns {string} Standardized date string
     */
    standardizeDate(dateStr) {
        const currentYear = new Date().getFullYear();
        if (dateStr.match(/^\d{1,2}\/\d{1,2}$/)) {
           const [month, day] = dateStr.split('/');
           return `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        // Try MM/DD/YY or MM/DD/YYYY format
        const match = dateStr.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](?:20)?(\d{2,4})/);
        if (match) {
            const month = match[1].padStart(2, '0');
            const day = match[2].padStart(2, '0');
            // If year is 2 digits, assume 2000s
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];
            return `${year}-${month}-${day}`;
        }
        
        // Add other format handling as needed
        return `${currentYear}-01-01`; // Default fallback
    }

    /**
     * Parse amount string to number
     * @param {string} amountStr - Amount string with possible currency symbols and formatting
     * @returns {number} Parsed amount
     */
    parseAmount(amountStr) {
        if (typeof amountStr !== 'string') return 0;
        
        // Clean the amount string - replace OCR errors
        const cleanAmount = amountStr
            .replace(/[$,\s]/g, '')  // Remove currency symbols, commas, spaces
            .replace(':', '.');      // Fix OCR errors with colons
        
        // Handle parentheses for negative numbers
        if (cleanAmount.startsWith('(') && cleanAmount.endsWith(')')) {
            return -parseFloat(cleanAmount.substring(1, cleanAmount.length - 1));
        }
        
        // Handle explicit negative sign
        if (cleanAmount.startsWith('-')) {
            return parseFloat(cleanAmount); // Already negative
        }
        
        // For expense patterns without explicit negative sign
        // Common for debit card transactions
        if (amountStr.toLowerCase().includes('debit') || 
            amountStr.toLowerCase().includes('withdrawal') ||
            amountStr.toLowerCase().includes('purchase')) {
            return -Math.abs(parseFloat(cleanAmount));
        }
        
        return parseFloat(cleanAmount) || 0;
    }

    /**
     * Clean up resources
     */
    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.isInitialized = false;
        }
    }
}
