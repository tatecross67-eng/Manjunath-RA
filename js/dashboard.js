/**
 * dashboard.js — Dashboard Calculations & Overview Controller
 * ---------------------------------------------------------------------------
 * Computes all summary totals, monthly series, and category breakdowns purely
 * from the provided transactions array. Never hardcodes financial figures.
 */

import {
  CATEGORY_COLORS,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatMonthLabel,
  sortTransactions,
} from './transactions.js';
import { calculateBudgetStatus } from './budget.js';

let monthlyChartInstance = null;
let categoryChartInstance = null;

/**
 * Destroys active Chart.js instances on the dashboard to prevent canvas reuse conflicts.
 */
export function destroyDashboardCharts() {
  if (monthlyChartInstance) {
    monthlyChartInstance.destroy();
    monthlyChartInstance = null;
  }
  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }
}

/**
 * Dynamically calculates Total Balance, Total Income, Total Expenses, and Monthly Spending.
 * Total Balance = Total Income - Total Expenses.
 * @param {Array<Object>} transactions
 * @param {string} targetMonth YYYY-MM
 */
export function calculateSummaryTotals(transactions, targetMonth) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let monthlySpending = 0;
  let monthlyIncome = 0;

  for (const txn of transactions) {
    const amount = Number(txn.amount) || 0;
    const isTargetMonth = targetMonth && String(txn.date || '').startsWith(targetMonth);

    if (txn.type === 'income') {
      totalIncome += amount;
      if (isTargetMonth) monthlyIncome += amount;
    } else {
      totalExpenses += amount;
      if (isTargetMonth) monthlySpending += amount;
    }
  }

  return {
    totalIncome,
    totalExpenses,
    totalBalance: totalIncome - totalExpenses,
    monthlySpending,
    monthlyIncome,
  };
}

/**
 * Returns the N most recent transactions sorted newest-first.
 * @param {Array<Object>} transactions
 * @param {number} limit
 */
export function getRecentTransactions(transactions, limit = 6) {
  return sortTransactions(transactions, 'date-desc').slice(0, limit);
}

/**
 * Builds a chronological 6-month series ending at referenceMonth.
 * @param {Array<Object>} transactions
 * @param {string} referenceMonth YYYY-MM
 * @param {number} monthsCount
 */
export function getMonthlyOverviewSeries(transactions, referenceMonth, monthsCount = 6) {
  const [refY, refM] = (referenceMonth || new Date().toISOString().slice(0, 7))
    .split('-')
    .map(Number);

  const buckets = [];
  const bucketMap = new Map();

  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    const d = new Date(refY, refM - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const entry = { monthKey: key, label, income: 0, expense: 0 };
    buckets.push(entry);
    bucketMap.set(key, entry);
  }

  for (const txn of transactions) {
    const key = String(txn.date || '').slice(0, 7);
    const bucket = bucketMap.get(key);
    if (!bucket) continue;
    const amt = Number(txn.amount) || 0;
    if (txn.type === 'income') {
      bucket.income += amt;
    } else {
      bucket.expense += amt;
    }
  }

  return buckets;
}

/**
 * Computes category-wise totals and percentages for expenses (or income).
 * @param {Array<Object>} transactions
 * @param {'expense'|'income'} type
 * @param {string|null} targetMonth Optional YYYY-MM filter
 */
export function getCategoryBreakdown(transactions, type = 'expense', targetMonth = null) {
  const totals = new Map();
  let grandTotal = 0;

  for (const txn of transactions) {
    if (txn.type !== type) continue;
    if (targetMonth && !String(txn.date || '').startsWith(targetMonth)) continue;

    const amt = Number(txn.amount) || 0;
    grandTotal += amt;
    const prev = totals.get(txn.category) || { amount: 0, count: 0 };
    totals.set(txn.category, { amount: prev.amount + amt, count: prev.count + 1 });
  }

  return Array.from(totals.entries())
    .map(([category, stats]) => ({
      category,
      amount: stats.amount,
      count: stats.count,
      percentage: grandTotal > 0 ? (stats.amount / grandTotal) * 100 : 0,
      color: CATEGORY_COLORS[category] || '#64748B',
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Renders the Dashboard view: KPIs, budget notice, charts, and recent transactions.
 * @param {HTMLElement} container
 * @param {Object} state
 * @param {Object} handlers
 */
export function renderDashboardView(container, state, handlers) {
  destroyDashboardCharts();

  const { transactions, budget, activeMonth } = state;
  const totals = calculateSummaryTotals(transactions, activeMonth);
  const recent = getRecentTransactions(transactions, 6);
  const monthlySeries = getMonthlyOverviewSeries(transactions, activeMonth, 6);
  const expenseCategories = getCategoryBreakdown(transactions, 'expense', activeMonth);
  const budgetStatus = calculateBudgetStatus(transactions, budget, activeMonth);
  const monthLabel = formatMonthLabel(activeMonth);

  // Optional Budget Threshold Notice
  let budgetNoticeHtml = '';
  if (budgetStatus.status === 'exceeded') {
    const overage = Math.abs(budgetStatus.remainingBudget);
    budgetNoticeHtml = `
      <div class="notice-banner notice-danger" role="alert">
        <div class="notice-banner-content">
          <i data-lucide="alert-octagon"></i>
          <span><strong>Budget Exceeded (${monthLabel}):</strong> Spending is ${formatCurrency(
      budgetStatus.monthlyExpenses
    )}, exceeding your ${formatCurrency(budgetStatus.monthlyLimit)} limit by ${formatCurrency(
      overage
    )} (${budgetStatus.utilizationPercent.toFixed(1)}%).</span>
        </div>
        <button type="button" class="link-btn" data-nav="budget">Manage Budget</button>
      </div>
    `;
  } else if (budgetStatus.status === 'warning') {
    budgetNoticeHtml = `
      <div class="notice-banner notice-warning" role="status">
        <div class="notice-banner-content">
          <i data-lucide="alert-triangle"></i>
          <span><strong>Approaching Budget Limit (${monthLabel}):</strong> You have used ${budgetStatus.utilizationPercent.toFixed(
      1
    )}% of your ${formatCurrency(budgetStatus.monthlyLimit)} monthly budget (${formatCurrency(
      budgetStatus.remainingBudget
    )} remaining).</span>
        </div>
        <button type="button" class="link-btn" data-nav="budget">Review Budget</button>
      </div>
    `;
  }

  // Category Breakdown Card Content
  let categoryBodyHtml = '';
  if (expenseCategories.length === 0) {
    categoryBodyHtml = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="pie-chart"></i></div>
        <h3 class="empty-title">No expenses in ${escapeHtml(monthLabel)}</h3>
        <p class="empty-desc">Add an expense for this month to view category distribution.</p>
      </div>
    `;
  } else {
    const legendHtml = expenseCategories
      .slice(0, 6)
      .map(
        (item) => `
        <div class="legend-row">
          <div class="legend-name-wrap">
            <span class="legend-swatch" style="background-color: ${item.color};"></span>
            <span class="legend-name">${escapeHtml(item.category)}</span>
          </div>
          <div class="legend-values">
            <span class="legend-amount">${escapeHtml(formatCurrency(item.amount))}</span>
            <span class="legend-pct">${item.percentage.toFixed(1)}%</span>
          </div>
        </div>
      `
      )
      .join('');

    categoryBodyHtml = `
      <div class="doughnut-layout">
        <div class="doughnut-canvas-wrap">
          <canvas id="dashboardCategoryChart" aria-label="Expense category breakdown chart"></canvas>
        </div>
        <div class="category-legend">${legendHtml}</div>
      </div>
    `;
  }

  // Recent Transactions Table Content
  let recentHtml = '';
  if (recent.length === 0) {
    recentHtml = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="receipt"></i></div>
        <h3 class="empty-title">No transactions yet</h3>
        <p class="empty-desc">Log your first income or expense to populate your financial dashboard.</p>
        <button type="button" class="btn btn-primary" id="dashEmptyAddBtn">
          <i data-lucide="plus"></i>
          <span>Add Transaction</span>
        </button>
      </div>
    `;
  } else {
    const rows = recent
      .map((txn) => {
        const isIncome = txn.type === 'income';
        const sign = isIncome ? '+' : '-';
        const colorClass = isIncome ? 'text-income' : 'text-expense';
        return `
          <tr>
            <td class="mono meta-inline">${escapeHtml(formatDate(txn.date))}</td>
            <td>
              <div class="txn-title-cell">
                <span class="txn-name">${escapeHtml(txn.title)}</span>
                ${
                  txn.description
                    ? `<span class="txn-desc">${escapeHtml(txn.description)}</span>`
                    : ''
                }
              </div>
            </td>
            <td class="meta-inline">${escapeHtml(txn.category)}</td>
            <td class="col-right mono ${colorClass}">${sign}${escapeHtml(
          formatCurrency(txn.amount)
        )}</td>
            <td class="col-right">
              <div class="row-actions">
                <button type="button" class="icon-btn" data-action="edit" data-id="${escapeHtml(
                  txn.id
                )}" aria-label="Edit ${escapeHtml(txn.title)}" title="Edit">
                  <i data-lucide="pencil"></i>
                </button>
                <button type="button" class="icon-btn icon-btn-danger" data-action="delete" data-id="${escapeHtml(
                  txn.id
                )}" aria-label="Delete ${escapeHtml(txn.title)}" title="Delete">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    recentHtml = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Transaction</th>
              <th>Category</th>
              <th class="col-right">Amount</th>
              <th class="col-right">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  const balanceClass = totals.totalBalance >= 0 ? 'text-income' : 'text-expense';

  container.innerHTML = `
    ${budgetNoticeHtml}

    <!-- KPI Summary Strip -->
    <section class="kpi-grid" aria-label="Financial Summary">
      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Total Balance</span>
          <span class="kpi-icon"><i data-lucide="landmark"></i></span>
        </div>
        <div class="kpi-value ${balanceClass}">${escapeHtml(formatCurrency(totals.totalBalance))}</div>
        <div class="kpi-meta">Net all-time balance</div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Total Income</span>
          <span class="kpi-icon"><i data-lucide="arrow-down-left"></i></span>
        </div>
        <div class="kpi-value text-income">${escapeHtml(formatCurrency(totals.totalIncome))}</div>
        <div class="kpi-meta">All recorded inflows</div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Total Expenses</span>
          <span class="kpi-icon"><i data-lucide="arrow-up-right"></i></span>
        </div>
        <div class="kpi-value text-expense">${escapeHtml(formatCurrency(totals.totalExpenses))}</div>
        <div class="kpi-meta">All recorded outflows</div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Monthly Spending</span>
          <span class="kpi-icon"><i data-lucide="calendar"></i></span>
        </div>
        <div class="kpi-value">${escapeHtml(formatCurrency(totals.monthlySpending))}</div>
        <div class="kpi-meta">${escapeHtml(monthLabel)}</div>
      </article>
    </section>

    <!-- Charts Row -->
    <section class="charts-grid">
      <article class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Monthly Spending Overview</h2>
            <p class="card-subtitle">6-month income vs. expense cash flow</p>
          </div>
          <button type="button" class="link-btn" data-nav="analytics">View Analytics</button>
        </div>
        <div class="chart-container">
          <canvas id="dashboardMonthlyChart" aria-label="Monthly spending overview chart"></canvas>
        </div>
      </article>

      <article class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Expense Category Breakdown</h2>
            <p class="card-subtitle">${escapeHtml(monthLabel)} spending share</p>
          </div>
        </div>
        ${categoryBodyHtml}
      </article>
    </section>

    <!-- Recent Transactions -->
    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Recent Transactions</h2>
          <p class="card-subtitle">Latest recorded financial activity</p>
        </div>
        <button type="button" class="link-btn" data-nav="transactions">View All</button>
      </div>
      ${recentHtml}
    </section>
  `;

  // Bind navigation links & row actions
  container.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onNavigate(btn.dataset.nav));
  });

  const emptyAddBtn = container.querySelector('#dashEmptyAddBtn');
  if (emptyAddBtn) {
    emptyAddBtn.addEventListener('click', () => handlers.onOpenAddModal());
  }

  container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onEditTransaction(btn.dataset.id));
  });

  container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onDeleteTransaction(btn.dataset.id));
  });

  // Render Chart.js Charts
  if (typeof window.Chart === 'function') {
    const monthlyCanvas = container.querySelector('#dashboardMonthlyChart');
    if (monthlyCanvas) {
      monthlyChartInstance = new window.Chart(monthlyCanvas, {
        type: 'bar',
        data: {
          labels: monthlySeries.map((m) => m.label),
          datasets: [
            {
              label: 'Income',
              data: monthlySeries.map((m) => m.income),
              backgroundColor: '#16A34A',
              borderRadius: 4,
              barPercentage: 0.72,
              categoryPercentage: 0.65,
            },
            {
              label: 'Expenses',
              data: monthlySeries.map((m) => m.expense),
              backgroundColor: '#1D4ED8',
              borderRadius: 4,
              barPercentage: 0.72,
              categoryPercentage: 0.65,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                usePointStyle: true,
                pointStyle: 'rectRounded',
                font: { family: "'DM Sans', sans-serif", size: 12 },
              },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { family: "'DM Sans', sans-serif", size: 11 }, color: '#64748B' },
            },
            y: {
              beginAtZero: true,
              grid: { color: '#F1F5F9' },
              ticks: {
                font: { family: "'JetBrains Mono', monospace", size: 11 },
                color: '#64748B',
                callback: (val) => `$${Number(val).toLocaleString()}`,
              },
            },
          },
        },
      });
    }

    const catCanvas = container.querySelector('#dashboardCategoryChart');
    if (catCanvas && expenseCategories.length > 0) {
      categoryChartInstance = new window.Chart(catCanvas, {
        type: 'doughnut',
        data: {
          labels: expenseCategories.map((c) => c.category),
          datasets: [
            {
              data: expenseCategories.map((c) => c.amount),
              backgroundColor: expenseCategories.map((c) => c.color),
              borderColor: '#FFFFFF',
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '66%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const item = expenseCategories[ctx.dataIndex];
                  return `${item.category}: ${formatCurrency(item.amount)} (${item.percentage.toFixed(
                    1
                  )}%)`;
                },
              },
            },
          },
        },
      });
    }
  }
}
