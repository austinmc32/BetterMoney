/**
 * Transaction Verifier - UI component for verifying and correcting extracted transactions
 */
class TransactionVerifier {
    /**
     * Create a new transaction verifier
     * @param {HTMLElement} containerElement - DOM element to render the verifier in
     * @param {Function} onSaveCallback - Callback function when corrections are saved
     */
    constructor(containerElement, onSaveCallback) {
        this.container = containerElement;
        this.onSaveCallback = onSaveCallback;
        this.transactions = [];
        this.currentIndex = 0;
        this.corrections = [];
    }
    
    /**
     * Initialize the verifier with transactions to review
     * @param {Array} transactions - Array of transactions needing review
     */
    init(transactions) {
        this.transactions = transactions || [];
        this.currentIndex = 0;
        this.corrections = [];
        
        if (this.transactions.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        this.renderUI();
        this.showCurrentTransaction();
    }
    
    /**
     * Render the verification UI
     */
    renderUI() {
        this.container.innerHTML = `
            <div class="verifier-container">
                <h2>Verify Transactions</h2>
                <p>Please review and correct these transactions that were detected with lower confidence.</p>
                <div class="progress-bar">
                    <div id="verifier-progress" style="width: 0%"></div>
                </div>
                <p class="progress-text">Transaction <span id="current-index">1</span> of <span id="total-count">${this.transactions.length}</span></p>
                
                <div class="transaction-card" id="current-transaction">
                    <div class="original-text">
                        <h3>Original Text</h3>
                        <pre id="original-line"></pre>
                    </div>
                    
                    <div class="transaction-form">
                        <div class="form-group">
                            <label for="tx-date">Date:</label>
                            <input type="date" id="tx-date" class="form-control">
                        </div>
                        
                        <div class="form-group">
                            <label for="tx-description">Description:</label>
                            <input type="text" id="tx-description" class="form-control">
                        </div>
                        
                        <div class="form-group">
                            <label for="tx-amount">Amount:</label>
                            <input type="number" id="tx-amount" class="form-control" step="0.01">
                        </div>
                        
                        <div class="form-group">
                            <label>Transaction Type:</label>
                            <div class="radio-group">
                                <input type="radio" id="type-income" name="tx-type" value="income">
                                <label for="type-income">Income</label>
                                
                                <input type="radio" id="type-expense" name="tx-type" value="expense">
                                <label for="type-expense">Expense</label>
                            </div>
                        </div>
                        
                        <div class="confidence-indicator">
                            <label>Confidence: </label>
                            <div class="confidence-bar">
                                <div id="confidence-level" class="confidence-level"></div>
                            </div>
                            <span id="confidence-percent">0%</span>
                        </div>
                    </div>
                </div>
                
                <div class="verifier-actions">
                    <button id="btn-remove" class="btn btn-danger">Remove Transaction</button>
                    <button id="btn-skip" class="btn btn-secondary">Skip</button>
                    <button id="btn-previous" class="btn btn-secondary" disabled>Previous</button>
                    <button id="btn-next" class="btn btn-primary">Next</button>
                    <button id="btn-save-all" class="btn btn-success">Save All Corrections</button>
                </div>
            </div>
        `;
        
        // Set up event listeners
        document.getElementById('btn-next').addEventListener('click', () => this.nextTransaction());
        document.getElementById('btn-previous').addEventListener('click', () => this.previousTransaction());
        document.getElementById('btn-skip').addEventListener('click', () => this.skipTransaction());
        document.getElementById('btn-remove').addEventListener('click', () => this.removeTransaction());
        document.getElementById('btn-save-all').addEventListener('click', () => this.saveAllCorrections());
        
        // Set up form change listeners
        const formElements = ['tx-date', 'tx-description', 'tx-amount', 'type-income', 'type-expense'];
        formElements.forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.updateCorrection());
        });
    }
    
    /**
     * Render empty state when no transactions need review
     */
    renderEmptyState() {
        this.container.innerHTML = `
            <div class="verifier-container">
                <h2>No Transactions to Verify</h2>
                <p>All transactions were detected with high confidence. No review needed!</p>
            </div>
        `;
    }
    
    /**
     * Show the current transaction for verification
     */
    showCurrentTransaction() {
        if (this.transactions.length === 0) return;
        
        const tx = this.transactions[this.currentIndex];
        
        // Update progress
        document.getElementById('current-index').textContent = this.currentIndex + 1;
        document.getElementById('total-count').textContent = this.transactions.length;
        document.getElementById('verifier-progress').style.width = `${((this.currentIndex + 1) / this.transactions.length) * 100}%`;
        
        // Update original text
        document.getElementById('original-line').textContent = tx.original?.line || 'No original text available';
        
        // Update form fields
        document.getElementById('tx-date').value = tx.date;
        document.getElementById('tx-description').value = tx.description;
        document.getElementById('tx-amount').value = tx.amount.toFixed(2);
        
        // Set transaction type
        const incomeRadio = document.getElementById('type-income');
        const expenseRadio = document.getElementById('type-expense');
        
        if (tx.type === 'income') {
            incomeRadio.checked = true;
            expenseRadio.checked = false;
        } else {
            incomeRadio.checked = false;
            expenseRadio.checked = true;
        }
        
        // Update confidence indicator
        const confidenceLevel = document.getElementById('confidence-level');
        const confidencePercent = document.getElementById('confidence-percent');
        
        confidenceLevel.style.width = `${tx.confidence * 100}%`;
        confidencePercent.textContent = `${Math.round(tx.confidence * 100)}%`;
        
        if (tx.confidence < 0.4) {
            confidenceLevel.className = 'confidence-level low';
        } else if (tx.confidence < 0.7) {
            confidenceLevel.className = 'confidence-level medium';
        } else {
            confidenceLevel.className = 'confidence-level high';
        }
        
        // Update button states
        document.getElementById('btn-previous').disabled = this.currentIndex === 0;
        document.getElementById('btn-next').disabled = this.currentIndex === this.transactions.length - 1;
    }
    
    /**
     * Update the correction for the current transaction
     */
    updateCorrection() {
        if (this.transactions.length === 0) return;
        
        const tx = this.transactions[this.currentIndex];
        
        // Get values from form
        const date = document.getElementById('tx-date').value;
        const description = document.getElementById('tx-description').value;
        const amount = parseFloat(document.getElementById('tx-amount').value);
        const type = document.getElementById('type-income').checked ? 'income' : 'expense';
        
        // Check if anything changed
        const hasChanged = 
            date !== tx.date || 
            description !== tx.description || 
            amount !== tx.amount || 
            type !== tx.type;
        
        if (hasChanged) {
            // Store correction
            this.corrections[this.currentIndex] = {
                ...tx,
                date,
                description,
                amount,
                type,
                corrected: true
            };
        } else {
            // Remove correction if it exists
            if (this.corrections[this.currentIndex]) {
                delete this.corrections[this.currentIndex];
            }
        }
    }
    
    /**
     * Move to the next transaction
     */
    nextTransaction() {
        if (this.currentIndex < this.transactions.length - 1) {
            this.currentIndex++;
            this.showCurrentTransaction();
        }
    }
    
    /**
     * Move to the previous transaction
     */
    previousTransaction() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.showCurrentTransaction();
        }
    }
    
    /**
     * Skip the current transaction
     */
    skipTransaction() {
        // Mark as skipped in corrections
        this.corrections[this.currentIndex] = {
            ...this.transactions[this.currentIndex],
            skipped: true
        };
        
        // Move to next if available
        if (this.currentIndex < this.transactions.length - 1) {
            this.nextTransaction();
        } else {
            this.saveAllCorrections();
        }
    }
    
    /**
     * Remove the current transaction
     */
    removeTransaction() {
        // Mark transaction for removal
        this.corrections[this.currentIndex] = {
            ...this.transactions[this.currentIndex],
            removed: true
        };
        
        // Show feedback to user
        const currentCard = document.getElementById('current-transaction');
        currentCard.classList.add('removed');
        
        // Add visual indicator
        const removeNotice = document.createElement('div');
        removeNotice.className = 'remove-notice';
        removeNotice.textContent = 'Transaction marked for removal';
        currentCard.appendChild(removeNotice);
        
        // Disable form fields
        const formElements = ['tx-date', 'tx-description', 'tx-amount', 'type-income', 'type-expense'];
        formElements.forEach(id => {
            document.getElementById(id).disabled = true;
        });
        
        // Disable remove button to prevent multiple clicks
        document.getElementById('btn-remove').disabled = true;
        
        // Auto-advance to next transaction after a short delay
        setTimeout(() => {
            if (this.currentIndex < this.transactions.length - 1) {
                this.nextTransaction();
            } else {
                this.saveAllCorrections();
            }
        }, 1000);
    }
    
    /**
     * Save all corrections
     */
    saveAllCorrections() {
        // Gather all corrections into an array, including removed items
        const correctedTransactions = this.corrections.filter(c => c && (c.corrected || c.skipped || c.removed));
        
        // Call the callback with corrections
        if (this.onSaveCallback && typeof this.onSaveCallback === 'function') {
            this.onSaveCallback(correctedTransactions);
        }
        
        // Show completion message
        const removedCount = this.corrections.filter(c => c && c.removed).length;
        this.container.innerHTML = `
            <div class="verifier-container">
                <h2>Verification Complete</h2>
                <p>Thank you for reviewing the transactions. Your corrections have been applied.</p>
                <p>${correctedTransactions.length} transactions were processed.</p>
                ${removedCount > 0 ? `<p>${removedCount} transactions were marked for removal.</p>` : ''}
            </div>
        `;
    }
}
