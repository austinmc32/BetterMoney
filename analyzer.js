class TransactionAnalyzer {
    constructor() {
        // Define categories and their keywords
        this.categories = {
            'Food & Dining': ['restaurant', 'cafe', 'coffee', 'mcdonalds', 'pizza', 'uber eats', 'doordash', 'grubhub', 'diner', 'bakery', 'grocery', 'market'],
            'Shopping': ['amazon', 'walmart', 'target', 'ebay', 'shop', 'store', 'retail', 'clothing', 'electronics'],
            'Entertainment': ['netflix', 'hulu', 'spotify', 'disney', 'cinema', 'movie', 'theater', 'concert', 'ticket', 'game'],
            'Transportation': ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'train', 'transit', 'parking', 'bus', 'metro', 'subway'],
            'Housing': ['rent', 'mortgage', 'property', 'apartment', 'condo', 'house', 'housing'],
            'Utilities': ['electric', 'water', 'gas', 'internet', 'phone', 'cable', 'utility', 'bill'],
            'Healthcare': ['doctor', 'medical', 'pharmacy', 'hospital', 'health', 'dental', 'vision', 'insurance'],
            'Personal': ['salon', 'spa', 'haircut', 'beauty', 'gym', 'fitness'],
            'Income': ['salary', 'payroll', 'deposit', 'wage', 'direct dep', 'payment received'],
            'Transfer': ['transfer', 'zelle', 'venmo', 'paypal', 'cash app', 'withdrawal', 'atm']
        };
    }

    /**
     * Analyze transactions and enrich with additional information
     * @param {Array} transactions - Array of transaction objects
     * @returns {Object} Analysis results
     */
    analyze(transactions) {
        if (!transactions || transactions.length === 0) {
            throw new Error('No transactions to analyze');
        }

        // Categorize transactions
        const categorizedTransactions = this.categorizeTransactions(transactions);

        // Calculate summary statistics
        const summary = this.calculateSummary(categorizedTransactions);

        // Monthly breakdown
        const monthlyData = this.calculateMonthlyBreakdown(categorizedTransactions);

        // Category breakdown
        const categoryBreakdown = this.calculateCategoryBreakdown(categorizedTransactions);

        return {
            transactions: categorizedTransactions,
            summary,
            monthlyData,
            categoryBreakdown
        };
    }

    /**
     * Categorize each transaction based on its description
     * @param {Array} transactions - Array of transaction objects
     * @returns {Array} Transactions with added category
     */
    categorizeTransactions(transactions) {
        return transactions.map(transaction => {
            const description = transaction.description.toLowerCase();
            let category = 'Other';
            
            // Determine category based on description keywords
            for (const [cat, keywords] of Object.entries(this.categories)) {
                for (const keyword of keywords) {
                    if (description.includes(keyword.toLowerCase())) {
                        category = cat;
                        break;
                    }
                }
                if (category !== 'Other') break;
            }
            
            // Override category based on transaction type
            if (transaction.type === 'income' && category !== 'Transfer') {
                category = 'Income';
            }
            
            // Standardize amount (make expenses negative)
            let amount = transaction.amount;
            if (transaction.type === 'expense' && amount > 0) {
                amount = -amount;
            }

            return {
                ...transaction,
                category,
                amount
            };
        });
    }

    /**
     * Calculate summary statistics
     * @param {Array} transactions - Categorized transactions
     * @returns {Object} Summary statistics
     */
    calculateSummary(transactions) {
        const summary = {
            totalIncome: 0,
            totalExpenses: 0,
            netFlow: 0,
            transactionCount: transactions.length,
            startDate: null,
            endDate: null
        };
        
        transactions.forEach(transaction => {
            const amount = transaction.amount;
            
            // Update totals
            if (amount > 0) {
                summary.totalIncome += amount;
            } else {
                summary.totalExpenses += Math.abs(amount);
            }
            
            // Track date range
            const date = new Date(transaction.date);
            if (!summary.startDate || date < summary.startDate) {
                summary.startDate = date;
            }
            if (!summary.endDate || date > summary.endDate) {
                summary.endDate = date;
            }
        });
        
        summary.netFlow = summary.totalIncome - summary.totalExpenses;
        
        return summary;
    }

    /**
     * Calculate monthly income and expense breakdowns
     * @param {Array} transactions - Categorized transactions
     * @returns {Object} Monthly data
     */
    calculateMonthlyBreakdown(transactions) {
        const monthlyData = {};
        
        transactions.forEach(transaction => {
            const date = new Date(transaction.date);
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyData[monthYear]) {
                monthlyData[monthYear] = {
                    income: 0,
                    expenses: 0
                };
            }
            
            const amount = transaction.amount;
            if (amount > 0) {
                monthlyData[monthYear].income += amount;
            } else {
                monthlyData[monthYear].expenses += Math.abs(amount);
            }
        });
        
        // Convert to array sorted by date
        return Object.entries(monthlyData)
            .map(([monthYear, data]) => ({
                month: monthYear,
                ...data
            }))
            .sort((a, b) => a.month.localeCompare(b.month));
    }

    /**
     * Calculate spending breakdown by category
     * @param {Array} transactions - Categorized transactions
     * @returns {Array} Category breakdown
     */
    calculateCategoryBreakdown(transactions) {
        const categories = {};
        
        transactions.forEach(transaction => {
            const category = transaction.category;
            const amount = transaction.amount;
            
            // Skip income for category breakdown
            if (amount > 0 && category !== 'Transfer') return;
            
            if (!categories[category]) {
                categories[category] = 0;
            }
            
            categories[category] += Math.abs(amount);
        });
        
        // Convert to array sorted by amount
        return Object.entries(categories)
            .map(([category, amount]) => ({
                category,
                amount
            }))
            .sort((a, b) => b.amount - a.amount);
    }
}
