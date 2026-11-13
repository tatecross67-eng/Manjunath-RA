/**
 * analytics.js — Expense Analytics Calculations & View Controller
 * ---------------------------------------------------------------------------
 * Computes category-wise expense breakdowns, monthly income vs. expenses,
 * spending distribution, highest spending category, and total savings.
 */

import {
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
} from './transactions.js';
import { getCategoryBreakdown, getMonthlyOverviewSeries } from './dashboard.js';

let incomeExpenseChart = null;
let categoryBarChart = null;
let distributionChart = null;

/**
 * Destroys active Chart.js instances on the analytics view.
 */
export function destroyAnalyticsCharts() {
  if (incomeExpenseChart) {
    incomeExpenseChart.destroy();
    incomeExpenseChart = null;
  }
  if (categoryBarChart) {
    categoryBarChart.destroy();
    categoryBarChart = null;
  }
  if (distributionChart) {
    distributionChart.destroy();
    distributionChart = null;
  }
}

/**
 * Filters transactions by timeframe relative to referenceMonth (YYYY-MM).
 * @param {Array<Object>} transactions
 * @param {'this-month'|'3-months'|'6-months'|'all'} timeframe
 * @param {string} referenceMonth
 */
export function filterByTimeframe(transactions, timeframe, referenceMonth) {
  if (timeframe === 'all') return [...transactions];

  const [refY, refM] = (referenceMonth || new Date().toISOString().slice(0, 7))
    .split('-')
    .map(Number);

  if (timeframe === 'this-month') {
    const key = `${refY}-${String(refM).padStart(2, '0')}`;
    return transactions.filter((t) => String(t.date || '').startsWith(key));
  }

  const monthsWindow = timeframe === '3-months' ? 3 : 6;
  const allowedMonths = new Set();
  for (let i = 0; i < monthsWindow; i += 1) {
    const d = new Date(refY, refM - 1 - i, 1);
    allowedMonths.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return transactions.filter((t) => allowedMonths.has(String(t.date || '').slice(0, 7)));
}

/**
 * Computes comprehensive analytics metrics for the selected transactions slice.
 * @param {Array<Object>} scopedTransactions
 * @param {Array<Object>} allTransactions
 * @param {string} timeframe
 * @param {string} referenceMonth
 */
export function calculateAnalyticsMetrics(
  scopedTransactions,
  allTransactions,
  timeframe,
  referenceMonth
) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let expenseCount = 0;

  for (const txn of scopedTransactions) {
    const amt = Number(txn.amount) || 0;
    if (txn.type === 'income') {
      totalIncome += amt;
    } else {
      totalExpenses += amt;
      expenseCount += 1;
    }
  }

  const totalSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;
  const averageExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;

  const categoryStats = getCategoryBreakdown(scopedTransactions, 'expense', null);
  const highestCategory = categoryStats.length > 0 ? categoryStats[0] : null;

  const monthsCount = timeframe === '3-months' ? 3 : 6;
  const monthlyComparison =
    timeframe === 'all'
      ? buildAllTimeMonthlySeries(allTransactions)
      : getMonthlyOverviewSeries(allTransactions, referenceMonth, monthsCount);

  // Spending distribution across days of the week (Mon - Sun)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayTotals = new Array(7).fill(0);

  for (const txn of scopedTransactions) {
    if (txn.type !== 'expense' || !txn.date) continue;
    const [y, m, d] = txn.date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    if (Number.isNaN(dateObj.getTime())) continue;
    const jsDay = dateObj.getDay(); // 0 = Sun, 1 = Mon...
    const mondayIdx = jsDay === 0 ? 6 : jsDay - 1;
    dayTotals[mondayIdx] += Number(txn.amount) || 0;
  }

  const spendingDistribution = dayNames.map((day, idx) => ({
    day,
    amount: dayTotals[idx],
  }));

  return {
    totalIncome,
    totalExpenses,
    totalSavings,
    savingsRate,
    averageExpense,
    expenseCount,
    highestCategory,
    categoryStats,
    monthlyComparison,
    spendingDistribution,
  };
}

/**
 * Builds monthly income vs. expense series across all recorded months sorted chronologically.
 * @param {Array<Object>} transactions
 */
function buildAllTimeMonthlySeries(transactions) {
  const map = new Map();
  for (const txn of transactions) {
    const key = String(txn.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (!map.has(key)) {
      const [y, m] = key.split('-').map(Number);
      const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      });
      map.set(key, { monthKey: key, label, income: 0, expense: 0 });
    }
    const bucket = map.get(key);
    const amt = Number(txn.amount) || 0;
    if (txn.type === 'income') bucket.income += amt;
    else bucket.expense += amt;
  }

  return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

/**
 * Renders the Expense Analytics view.
 * @param {HTMLElement} container
 * @param {Object} state
 * @param {Object} handlers
 */
export function renderAnalyticsView(container, state, handlers) {
  destroyAnalyticsCharts();

  const { transactions, analyticsTimeframe, activeMonth } = state;
  const scoped = filterByTimeframe(transactions, analyticsTimeframe, activeMonth);
  const metrics = calculateAnalyticsMetrics(
    scoped,
    transactions,
    analyticsTimeframe,
    activeMonth
  );

  const timeframeLabelMap = {
    'this-month': formatMonthLabel(activeMonth),
    '3-months': 'Last 3 Months',
    '6-months': 'Last 6 Months',
    all: 'All Time',
  };
  const scopeLabel = timeframeLabelMap[analyticsTimeframe] || 'Selected Period';

  const savingsClass = metrics.totalSavings >= 0 ? 'text-income' : 'text-expense';

  const highestTitle = metrics.highestCategory
    ? metrics.highestCategory.category
    : 'No Expenses';
  const highestMeta = metrics.highestCategory
    ? `${formatCurrency(metrics.highestCategory.amount)} · ${metrics.highestCategory.percentage.toFixed(
        1
      )}% of spending`
    : 'No expense records in range';

  let categoryTableHtml = '';
  if (metrics.categoryStats.length === 0) {
    categoryTableHtml = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="bar-chart-2"></i></div>
        <h3 class="empty-title">No expense data for ${escapeHtml(scopeLabel)}</h3>
        <p class="empty-desc">Add expense entries or switch to a wider timeframe to inspect category analytics.</p>
      </div>
    `;
  } else {
    const rows = metrics.categoryStats
      .map(
        (cat) => `
        <tr>
          <td>
            <div class="legend-name-wrap">
              <span class="legend-swatch" style="background-color: ${cat.color};"></span>
              <span class="txn-name">${escapeHtml(cat.category)}</span>
            </div>
          </td>
          <td class="col-right mono">${cat.count}</td>
          <td class="col-right mono">${escapeHtml(formatCurrency(cat.amount))}</td>
          <td class="col-right mono">${cat.percentage.toFixed(1)}%</td>
        </tr>
      `
      )
      .join('');

    categoryTableHtml = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th class="col-right">Entries</th>
              <th class="col-right">Total Spent</th>
              <th class="col-right">Share</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="filter-toolbar" style="margin-bottom: 0;">
      <div>
        <span class="card-subtitle">Showing analytics for <strong>${escapeHtml(
          scopeLabel
        )}</strong></span>
      </div>
      <div class="segmented-control" role="group" aria-label="Analytics Timeframe">
        <button type="button" class="segment-btn ${
          analyticsTimeframe === 'this-month' ? 'active' : ''
        }" data-timeframe="this-month">This Month</button>
        <button type="button" class="segment-btn ${
          analyticsTimeframe === '3-months' ? 'active' : ''
        }" data-timeframe="3-months">3 Months</button>
        <button type="button" class="segment-btn ${
          analyticsTimeframe === '6-months' ? 'active' : ''
        }" data-timeframe="6-months">6 Months</button>
        <button type="button" class="segment-btn ${
          analyticsTimeframe === 'all' ? 'active' : ''
        }" data-timeframe="all">All Time</button>
      </div>
    </div>

    <!-- Analytics KPIs -->
    <section class="kpi-grid" aria-label="Analytics Summary">
      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Highest Spending Category</span>
          <span class="kpi-icon"><i data-lucide="trending-up"></i></span>
        </div>
        <div class="kpi-value kpi-value-sm">${escapeHtml(highestTitle)}</div>
        <div class="kpi-meta">${escapeHtml(highestMeta)}</div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Total Savings</span>
          <span class="kpi-icon"><i data-lucide="piggy-bank"></i></span>
        </div>
        <div class="kpi-value ${savingsClass}">${escapeHtml(
    formatCurrency(metrics.totalSavings)
  )}</div>
        <div class="kpi-meta">Income minus expenses</div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Savings Rate</span>
          <span class="kpi-icon"><i data-lucide="percent"></i></span>
        </div>
        <div class="kpi-value">${metrics.savingsRate.toFixed(1)}%</div>
        <div class="kpi-meta">Of ${escapeHtml(formatCurrency(metrics.totalIncome))} income</div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Average Expense</span>
          <span class="kpi-icon"><i data-lucide="receipt"></i></span>
        </div>
        <div class="kpi-value">${escapeHtml(formatCurrency(metrics.averageExpense))}</div>
        <div class="kpi-meta">Across ${metrics.expenseCount} expense entries</div>
      </article>
    </section>

    <!-- Primary Analytics Charts -->
    <section class="charts-grid-equal">
      <article class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Monthly Income vs. Expenses</h2>
            <p class="card-subtitle">Cash flow comparison over time</p>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="analyticsIncomeExpenseChart" aria-label="Monthly income versus expenses chart"></canvas>
        </div>
      </article>

      <article class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Category-wise Expense Breakdown</h2>
            <p class="card-subtitle">${escapeHtml(scopeLabel)} spending by category</p>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="analyticsCategoryChart" aria-label="Category expense breakdown chart"></canvas>
        </div>
      </article>
    </section>

    <!-- Secondary Distribution & Table -->
    <section class="charts-grid">
      <article class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Spending Distribution by Day of Week</h2>
            <p class="card-subtitle">Outflow cadence across Monday to Sunday</p>
          </div>
        </div>
        <div class="chart-container-sm">
          <canvas id="analyticsDistributionChart" aria-label="Weekly spending distribution chart"></canvas>
        </div>
      </article>

      <article class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Category Breakdown Details</h2>
            <p class="card-subtitle">${escapeHtml(scopeLabel)}</p>
          </div>
        </div>
        ${categoryTableHtml}
      </article>
    </section>
  `;

  // Timeframe switch handlers
  container.querySelectorAll('[data-timeframe]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onTimeframeChange(btn.dataset.timeframe);
    });
  });

  // Render Chart.js instances
  if (typeof window.Chart === 'function') {
    const ieCanvas = container.querySelector('#analyticsIncomeExpenseChart');
    if (ieCanvas) {
      incomeExpenseChart = new window.Chart(ieCanvas, {
        type: 'bar',
        data: {
          labels: metrics.monthlyComparison.map((m) => m.label),
          datasets: [
            {
              label: 'Income',
              data: metrics.monthlyComparison.map((m) => m.income),
              backgroundColor: '#16A34A',
              borderRadius: 4,
            },
            {
              label: 'Expenses',
              data: metrics.monthlyComparison.map((m) => m.expense),
              backgroundColor: '#DC2626',
              borderRadius: 4,
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
              ticks: { color: '#64748B', font: { size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: '#F1F5F9' },
              ticks: {
                color: '#64748B',
                font: { family: "'JetBrains Mono', monospace", size: 11 },
                callback: (val) => `$${Number(val).toLocaleString()}`,
              },
            },
          },
        },
      });
    }

    const catCanvas = container.querySelector('#analyticsCategoryChart');
    if (catCanvas) {
      categoryBarChart = new window.Chart(catCanvas, {
        type: 'bar',
        data: {
          labels: metrics.categoryStats.map((c) => c.category),
          datasets: [
            {
              label: 'Expenses',
              data: metrics.categoryStats.map((c) => c.amount),
              backgroundColor: metrics.categoryStats.map((c) => c.color),
              borderRadius: 4,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => formatCurrency(ctx.parsed.x),
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: '#F1F5F9' },
              ticks: {
                color: '#64748B',
                font: { family: "'JetBrains Mono', monospace", size: 11 },
                callback: (val) => `$${Number(val).toLocaleString()}`,
              },
            },
            y: {
              grid: { display: false },
              ticks: { color: '#0F172A', font: { size: 12 } },
            },
          },
        },
      });
    }

    const distCanvas = container.querySelector('#analyticsDistributionChart');
    if (distCanvas) {
      distributionChart = new window.Chart(distCanvas, {
        type: 'line',
        data: {
          labels: metrics.spendingDistribution.map((d) => d.day),
          datasets: [
            {
              label: 'Spending',
              data: metrics.spendingDistribution.map((d) => d.amount),
              borderColor: '#1D4ED8',
              backgroundColor: 'rgba(29, 78, 216, 0.08)',
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: 3.5,
              pointBackgroundColor: '#1D4ED8',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Spent: ${formatCurrency(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#64748B', font: { size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: '#F1F5F9' },
              ticks: {
                color: '#64748B',
                font: { family: "'JetBrains Mono', monospace", size: 11 },
                callback: (val) => `$${Number(val).toLocaleString()}`,
              },
            },
          },
        },
      });
    }
  }
}
