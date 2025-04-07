document.addEventListener('DOMContentLoaded', () => {
    // Initialize classes
    const parser = new OCRParser();
    const analyzer = new TransactionAnalyzer();
    const reportGenerator = new ReportGenerator();
    
    // Check if TransactionVerifier is available
    let verifier = null;
    if (typeof TransactionVerifier !== 'undefined') {
        verifier = new TransactionVerifier(
            document.getElementById('verification-container'),
            applyCorrections
        );
    } else {
        console.warn('TransactionVerifier not loaded. Verification features will be disabled.');
    }
    
    // Set up drop area
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const fileNameDisplay = document.getElementById('file-name');
    
    // Elements for showing/hiding sections
    const uploadSection = document.getElementById('upload-section');
    const loadingSection = document.getElementById('loading-section');
    const verificationSection = document.getElementById('verification-section');
    const resultsSection = document.getElementById('results-section');
    
    // Progress elements
    const progressStatus = document.getElementById('progress-status');
    const progressBarFill = document.getElementById('progress-bar-fill');
    
    // Set up progress callback
    parser.setProgressCallback(progress => {
        progressStatus.textContent = progress.message || 'Processing...';
        progressBarFill.style.width = `${Math.round(progress.progress * 100)}%`;
    });
    
    // Set up drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropArea.classList.add('highlight');
    }
    
    function unhighlight() {
        dropArea.classList.remove('highlight');
    }
    
    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }
    
    // Handle file input change
    fileInput.addEventListener('change', function() {
        if (this.files.length > 0) {
            handleFile(this.files[0]);
        }
    });
    
    // Process the uploaded file
    async function handleFile(file) {
        fileNameDisplay.textContent = file.name;
        
        // Show loading indicator
        uploadSection.classList.add('hidden');
        loadingSection.classList.remove('hidden');
        
        // Reset progress
        progressStatus.textContent = 'Initializing...';
        progressBarFill.style.width = '0%';
        
        try {
            // Parse the file with verification callback
            const { transactions, text, needsReview } = await parser.parseFile(file);
            
            // Save OCR text for debugging
            document.getElementById('ocr-text').textContent = text;
            
            // If verifier is available and there are transactions that need review, show the verification UI
            if (verifier && needsReview && needsReview.length > 0) {
                loadingSection.classList.add('hidden');
                verificationSection.classList.remove('hidden');
                verifier.init(needsReview);
            } else {
                // No review needed or verifier not available, proceed directly to analysis
                showResults(transactions);
            }
        } catch (error) {
            console.error('Error processing file:', error);
            alert(`Error processing file: ${error.message}`);
            
            // Go back to upload screen
            loadingSection.classList.add('hidden');
            uploadSection.classList.remove('hidden');
        }
    }
    
    // Apply corrections from the verifier
    function applyCorrections(correctedTransactions) {
        // If parser doesn't have getLastResults method, we'll need to fix that
        let transactions = [];
        try {
            // Get the original parsing results
            transactions = parser.getLastResults();
        } catch (e) {
            console.warn('Could not get last results from parser:', e);
            // Proceed with empty array as fallback
            transactions = [];
        }
        
        // Apply corrections to the transactions array
        correctedTransactions.forEach(correction => {
            if (correction.removed) {
                // Skip removed transactions - they won't be added to the final results
                return;
            }
            
            if (correction.corrected) {
                // Find and update the transaction in the original results
                const index = transactions.findIndex(tx => 
                    tx.date === correction.date && 
                    tx.description === correction.original.description);
                
                if (index !== -1) {
                    transactions[index] = {
                        ...correction,
                        corrected: true
                    };
                } else {
                    // If not found, add as a new transaction
                    transactions.push(correction);
                }
            }
        });
        
        // Apply corrections in the parser for learning
        if (typeof parser.applyUserCorrections === 'function') {
            parser.applyUserCorrections(correctedTransactions);
        }
        
        // Show results with corrected transactions
        showResults(transactions);
    }
    
    // Show results after parsing/verification
    function showResults(transactions) {
        // Hide verification section if visible
        verificationSection.classList.add('hidden');
        loadingSection.classList.add('hidden');
        
        // Analyze the transactions
        const analysisResults = analyzer.analyze(transactions);
        
        // Store the results in the reports map
        reports.set(currentReportId, {
            transactions,
            analysis: analysisResults
        });
        
        // If this is a new report (beyond the first), create a new tab and panel
        if (currentReportId !== 'report-1' && !document.getElementById(`${currentReportId}-panel`)) {
            createNewReportTab(currentReportId);
        }
        
        // Generate and display reports for the current report
        reportGenerator.generateReports(analysisResults, currentReportId);
        
        // Show results section and activate the current report tab
        resultsSection.classList.remove('hidden');
        document.querySelector(`[data-tab="${currentReportId}"]`).click();
        
        // Enable/disable buttons
        updateReportControls();
    }
    
    // Toggle OCR text view
    document.getElementById('toggle-ocr-text').addEventListener('click', () => {
        const container = document.getElementById('ocr-text-container');
        container.classList.toggle('hidden');
        
        const button = document.getElementById('toggle-ocr-text');
        button.textContent = container.classList.contains('hidden') 
            ? 'Show OCR Text' 
            : 'Hide OCR Text';
    });
    
    // Button to upload another statement
    document.getElementById('new-upload-btn').addEventListener('click', () => {
        resultsSection.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        fileNameDisplay.textContent = 'No file selected';
        fileInput.value = '';
    });
    
    // Report management
    const reports = new Map(); // Store all reports
    let currentReportId = 'report-1';
    let reportCounter = 1;
    
    // Set up tab navigation
    const reportTabs = document.getElementById('report-tabs');
    const reportsContainer = document.getElementById('reports-container');
    const addReportBtn = document.getElementById('add-report-btn');
    const combineReportsBtn = document.getElementById('combine-reports-btn');
    const removeReportBtn = document.getElementById('remove-report-btn');
    
    // Tab click handler - Switch between reports
    reportTabs.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn') && !e.target.classList.contains('add-report-btn')) {
            const tabId = e.target.dataset.tab;
            
            // Update active tab
            document.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
            e.target.classList.add('active');
            
            // Show selected report panel
            document.querySelectorAll('.report-panel').forEach(panel => panel.classList.remove('active'));
            document.getElementById(`${tabId}-panel`).classList.add('active');
            
            // Update current report ID
            currentReportId = tabId;
            
            // Enable/disable remove button (can't remove first report)
            removeReportBtn.disabled = (currentReportId === 'report-1');
        }
    });
    
    // Add new report
    addReportBtn.addEventListener('click', () => {
        // Show file input to add another report
        uploadSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        fileNameDisplay.textContent = 'No file selected';
        fileInput.value = '';
        
        // Prepare for new report
        reportCounter++;
        currentReportId = `report-${reportCounter}`;
    });
    
    // Combine reports
    combineReportsBtn.addEventListener('click', () => {
        if (reports.size < 2) {
            alert('You need at least 2 reports to combine them.');
            return;
        }
        
        // Generate combined report
        generateCombinedReport();
        
        // Show combined report tab
        const combinedTab = document.querySelector('[data-tab="combined-report"]');
        if (!combinedTab) {
            // Create combined tab if it doesn't exist
            const combinedTabBtn = document.createElement('button');
            combinedTabBtn.className = 'tab-btn';
            combinedTabBtn.dataset.tab = 'combined-report';
            combinedTabBtn.textContent = 'Combined Report';
            reportTabs.insertBefore(combinedTabBtn, addReportBtn);
            
            // Activate the tab
            combinedTabBtn.click();
        } else {
            combinedTab.click();
        }
    });
    
    // Remove current report
    removeReportBtn.addEventListener('click', () => {
        if (currentReportId === 'report-1' || currentReportId === 'combined-report') {
            return; // Can't remove first report or combined report
        }
        
        // Remove report from map
        reports.delete(currentReportId);
        
        // Remove tab and panel
        const tabToRemove = document.querySelector(`[data-tab="${currentReportId}"]`);
        const panelToRemove = document.getElementById(`${currentReportId}-panel`);
        
        if (tabToRemove) tabToRemove.remove();
        if (panelToRemove) panelToRemove.remove();
        
        // Activate first report tab
        document.querySelector('[data-tab="report-1"]').click();
    });
    
    /**
     * Create a new report tab and panel
     * @param {string} reportId - The ID of the new report
     */
    function createNewReportTab(reportId) {
        // Create new tab button
        const newTab = document.createElement('button');
        newTab.className = 'tab-btn';
        newTab.dataset.tab = reportId;
        newTab.textContent = `Report ${reportId.split('-')[1]}`;
        reportTabs.insertBefore(newTab, addReportBtn);
        
        // Clone the first report panel to create new panel
        const templatePanel = document.getElementById('report-1-panel');
        const newPanel = templatePanel.cloneNode(true);
        newPanel.id = `${reportId}-panel`;
        newPanel.classList.remove('active');
        
        // Update IDs of elements within the panel
        newPanel.querySelectorAll('[id]').forEach(el => {
            el.id = `${reportId}-${el.id.split('-').pop()}`;
        });
        
        // Add the new panel to the container
        reportsContainer.appendChild(newPanel);
    }
    
    /**
     * Generate a combined report from all individual reports
     */
    function generateCombinedReport() {
        // Merge all transactions
        const allTransactions = [];
        let totalIncome = 0;
        let totalExpenses = 0;
        
        reports.forEach((report, reportId) => {
            // Add report identifier to transactions
            const reportTransactions = report.transactions.map(tx => ({
                ...tx,
                reportId,
                reportName: `Report ${reportId.split('-')[1]}`
            }));
            
            allTransactions.push(...reportTransactions);
            
            // Sum up totals
            totalIncome += report.analysis.income;
            totalExpenses += report.analysis.expenses;
        });
        
        // Update combined report UI
        document.getElementById('combined-total-income').textContent = formatCurrency(totalIncome);
        document.getElementById('combined-total-expenses').textContent = formatCurrency(totalExpenses);
        document.getElementById('combined-net-flow').textContent = formatCurrency(totalIncome - totalExpenses);
        
        // Generate combined charts
        generateCombinedCharts();
        
        // Generate combined transactions table
        generateCombinedTransactionsTable(allTransactions);
    }
    
    /**
     * Generate charts for the combined report
     */
    function generateCombinedCharts() {
        // Implementation for combined income/expense and category charts
        // Similar to reportGenerator.generateCharts but aggregating data from all reports
        // ...
    }
    
    /**
     * Generate combined transactions table
     * @param {Array} transactions - All transactions from all reports
     */
    function generateCombinedTransactionsTable(transactions) {
        const tbody = document.getElementById('combined-transactions-body');
        tbody.innerHTML = '';
        
        // Sort transactions by date (newest first)
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        transactions.forEach(tx => {
            const row = document.createElement('tr');
            row.className = tx.type; // 'income' or 'expense' class
            
            // Format date
            const date = new Date(tx.date);
            const formattedDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
            
            row.innerHTML = `
                <td>${formattedDate}</td>
                <td>${tx.description}</td>
                <td>${tx.category || 'Uncategorized'}</td>
                <td class="${tx.type}">${formatCurrency(tx.amount)}</td>
                <td><span class="report-name-tag">${tx.reportName}</span></td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    /**
     * Update report controls based on number of reports
     */
    function updateReportControls() {
        const hasMultipleReports = reports.size > 1;
        combineReportsBtn.disabled = !hasMultipleReports;
        
        // Can't remove first report
        removeReportBtn.disabled = (currentReportId === 'report-1' || currentReportId === 'combined-report');
    }
    
    /**
     * Format a number as currency
     * @param {number} amount - Amount to format
     * @returns {string} Formatted currency string
     */
    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }
});
