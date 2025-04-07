class ReportGenerator {
    constructor() {
        this.colors = [
            '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
            '#1abc9c', '#d35400', '#c0392b', '#16a085', '#8e44ad',
            '#27ae60', '#2980b9', '#f1c40f', '#e67e22', '#34495e'
        ];
    }

    /**
     * Generate reports for the given analysis results
     * @param {Object} results - Analysis results
     * @param {string} reportId - The ID of the report to generate
     */
    generateReports(results, reportId = 'report-1') {
        // Generate summary cards
        this.generateSummaryCards(results, reportId);
        
        // Generate charts
        this.generateCharts(results, reportId);
        
        // Generate transactions table
        this.generateTransactionsTable(results.transactions, reportId);
    }

    /**
     * Generate summary cards
     * @param {Object} results - Analysis results
     * @param {string} reportId - The ID of the report
     */
    generateSummaryCards(results, reportId) {
        // Get elements for this specific report
        const totalIncomeEl = document.getElementById(`${reportId}-total-income`) || 
                             document.getElementById('total-income');
        const totalExpensesEl = document.getElementById(`${reportId}-total-expenses`) || 
                              document.getElementById('total-expenses');
        const netFlowEl = document.getElementById(`${reportId}-net-flow`) || 
                         document.getElementById('net-flow');
        
        if (totalIncomeEl) totalIncomeEl.textContent = this.formatCurrency(results.income);
        if (totalExpensesEl) totalExpensesEl.textContent = this.formatCurrency(results.expenses);
        if (netFlowEl) netFlowEl.textContent = this.formatCurrency(results.netFlow);
    }

    /**
     * Generate and display reports based on analysis results
     * @param {Object} analysisResults - Results from the transaction analyzer
     */
    generateReports(analysisResults) {
        this.updateSummaryCards(analysisResults.summary);
        this.createIncomeExpenseChart(analysisResults.monthlyData);
        this.createCategoryChart(analysisResults.categoryBreakdown);
        this.populateTransactionsTable(analysisResults.transactions);
    }

    /**
     * Update the summary cards with analysis results
     * @param {Object} summary - Summary statistics
     */
    updateSummaryCards(summary) {
        document.getElementById('total-income').textContent = this.formatCurrency(summary.totalIncome);
        document.getElementById('total-expenses').textContent = this.formatCurrency(summary.totalExpenses);
        
        const netFlowElement = document.getElementById('net-flow');
        netFlowElement.textContent = this.formatCurrency(summary.netFlow);
        netFlowElement.className = summary.netFlow >= 0 ? 'income' : 'expense';
    }

    /**
     * Create a chart comparing income and expenses by month
     * @param {Array} monthlyData - Monthly breakdown data
     */
    createIncomeExpenseChart(monthlyData) {
        const ctx = document.getElementById('income-expense-chart').getContext('2d');
        
        // Format labels to be more readable
        const labels = monthlyData.map(data => {
            const [year, month] = data.month.split('-');
            return `${this.getMonthName(parseInt(month))} ${year}`;
        });
        
        const incomeData = monthlyData.map(data => data.income);
        const expenseData = monthlyData.map(data => data.expenses);
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Income',
                        data: incomeData,
                        backgroundColor: '#2ecc71',
                        borderColor: '#27ae60',
                        borderWidth: 1
                    },
                    {
                        label: 'Expenses',
                        data: expenseData,
                        backgroundColor: '#e74c3c',
                        borderColor: '#c0392b',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => this.formatCurrency(value)
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${this.formatCurrency(context.raw)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Create a pie chart showing spending by category
     * @param {Array} categoryData - Category breakdown data
     */
    createCategoryChart(categoryData) {
        // Filter out any income categories
        const expenseCategories = categoryData.filter(cat => cat.category !== 'Income');
        
        const ctx = document.getElementById('category-chart').getContext('2d');
        
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: expenseCategories.map(cat => cat.category),
                datasets: [{
                    data: expenseCategories.map(cat => cat.amount),
                    backgroundColor: this.colors.slice(0, expenseCategories.length),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.raw;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${context.label}: ${this.formatCurrency(value)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Populate the transactions table
     * @param {Array} transactions - Categorized transaction data
     */
    populateTransactionsTable(transactions) {
        const tbody = document.getElementById('transactions-body');
        tbody.innerHTML = '';
        
        // Sort transactions by date (most recent first)
        const sortedTransactions = [...transactions].sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });
        
        // Show only the most recent 100 transactions for performance
        const transactionsToShow = sortedTransactions.slice(0, 100);
        
        transactionsToShow.forEach(transaction => {
            const row = document.createElement('tr');
            row.className = transaction.amount >= 0 ? 'income-row' : 'expense-row';
            row.dataset.type = transaction.amount >= 0 ? 'income' : 'expense';
            
            const date = new Date(transaction.date);
            const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            
            row.innerHTML = `
                <td>${formattedDate}</td>
                <td>${transaction.description}</td>
                <td>${transaction.category}</td>
                <td class="${transaction.amount >= 0 ? 'income' : 'expense'}">${this.formatCurrency(transaction.amount)}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Set up transaction filters
        this.setupTransactionFilters();
    }

    /**
     * Set up transaction filter buttons
     */
    setupTransactionFilters() {
        const filterButtons = document.querySelectorAll('.filter-btn');
        const rows = document.querySelectorAll('#transactions-body tr');
        
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Update active button
                document.querySelector('.filter-btn.active').classList.remove('active');
                button.classList.add('active');
                
                const filter = button.dataset.filter;
                
                // Filter rows
                rows.forEach(row => {
                    if (filter === 'all' || row.dataset.type === filter) {
                        row.style.display = '';
                    } else {
                        row.style.display = 'none';
                    }
                });
            });
        });
    }

    /**
     * Format a number as currency
     * @param {number} amount - The amount to format
     * @returns {string} Formatted currency string
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    /**
     * Get month name from month number
     * @param {number} monthNumber - Month number (1-12)
     * @returns {string} Month name
     */
    getMonthName(monthNumber) {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return months[monthNumber - 1];
    }
}
