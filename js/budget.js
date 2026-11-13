/**
 * budget.js — Budget Calculations & Management View Controller
 * ---------------------------------------------------------------------------
 * Computes monthly budget utilization, remaining allowance, 80% warning,
 * and >100% exceeded alert states independently of storage.
 */

import {
  EXPENSE_CATEGORIES,
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
} from './transactions.js';

/**
 * Calculates overall monthly budget status for a target YYYY-MM month.
 * @param {Array<Object>} transactions
 * @param {{ monthlyLimit: number, categoryLimits?: Object<string, number> }} budget
 * @param {string} targetMonth YYYY-MM
 */
export function calculateBudgetStatus(transactions, budget, targetMonth) {
  const monthlyLimit = Number(budget?.monthlyLimit) || 0;
  let monthlyExpenses = 0;

  for (const txn of transactions) {
    if (txn.type !== 'expense') continue;
    if (targetMonth && !String(txn.date || '').startsWith(targetMonth)) continue;
    monthlyExpenses += Number(txn.amount) || 0;
  }

  if (monthlyLimit <= 0) {
    return {
      monthlyLimit: 0,
      monthlyExpenses,
      remainingBudget: 0,
      utilizationPercent: 0,
      clampedPercent: 0,
      status: 'unset',
    };
  }

  const remainingBudget = monthlyLimit - monthlyExpenses;
  const utilizationPercent = (monthlyExpenses / monthlyLimit) * 100;
  const clampedPercent = Math.min(100, Math.max(0, utilizationPercent));

  let status = 'ok';
  if (utilizationPercent > 100) {
    status = 'exceeded';
  } else if (utilizationPercent >= 80) {
    status = 'warning';
  }

  return {
    monthlyLimit,
    monthlyExpenses,
    remainingBudget,
    utilizationPercent,
    clampedPercent,
    status,
  };
}

/**
 * Computes monthly expense totals per category alongside optional per-category limits.
 * @param {Array<Object>} transactions
 * @param {{ categoryLimits?: Object<string, number> }} budget
 * @param {string} targetMonth
 */
export function calculateCategoryBudgets(transactions, budget, targetMonth) {
  const spentMap = new Map();
  for (const txn of transactions) {
    if (txn.type !== 'expense') continue;
    if (targetMonth && !String(txn.date || '').startsWith(targetMonth)) continue;
    const prev = spentMap.get(txn.category) || 0;
    spentMap.set(txn.category, prev + (Number(txn.amount) || 0));
  }

  const limits = budget?.categoryLimits || {};

  return EXPENSE_CATEGORIES.map((category) => {
    const spent = spentMap.get(category) || 0;
    const limit = Number(limits[category]) || 0;
    const utilization = limit > 0 ? (spent / limit) * 100 : 0;
    let status = 'ok';
    if (limit <= 0) status = 'unset';
    else if (utilization > 100) status = 'exceeded';
    else if (utilization >= 80) status = 'warning';

    return {
      category,
      spent,
      limit,
      remaining: limit > 0 ? limit - spent : 0,
      utilization,
      status,
    };
  });
}

/**
 * Renders the Budget Management view.
 * @param {HTMLElement} container
 * @param {Object} state
 * @param {Object} handlers
 */
export function renderBudgetView(container, state, handlers) {
  const { transactions, budget, activeMonth } = state;
  const statusInfo = calculateBudgetStatus(transactions, budget, activeMonth);
  const categoryRows = calculateCategoryBudgets(transactions, budget, activeMonth);
  const monthLabel = formatMonthLabel(activeMonth);

  // Alert / Warning Banner
  let alertBannerHtml = '';
  if (statusInfo.status === 'exceeded') {
    const overAmount = Math.abs(statusInfo.remainingBudget);
    alertBannerHtml = `
      <div class="notice-banner notice-danger" role="alert">
        <div class="notice-banner-content">
          <i data-lucide="alert-octagon"></i>
          <span><strong>Budget Exceeded:</strong> Monthly spending in ${escapeHtml(
            monthLabel
          )} has exceeded your ${formatCurrency(statusInfo.monthlyLimit)} limit by <strong>${formatCurrency(
      overAmount
    )}</strong> (${statusInfo.utilizationPercent.toFixed(1)}% utilized).</span>
        </div>
      </div>
    `;
  } else if (statusInfo.status === 'warning') {
    alertBannerHtml = `
      <div class="notice-banner notice-warning" role="status">
        <div class="notice-banner-content">
          <i data-lucide="alert-triangle"></i>
          <span><strong>Approaching Budget Limit (80%+ Warning):</strong> You have spent ${formatCurrency(
            statusInfo.monthlyExpenses
          )} of your ${formatCurrency(
      statusInfo.monthlyLimit
    )} budget (${statusInfo.utilizationPercent.toFixed(1)}% utilized). ${formatCurrency(
      statusInfo.remainingBudget
    )} remaining.</span>
        </div>
      </div>
    `;
  } else if (statusInfo.status === 'ok') {
    alertBannerHtml = `
      <div class="notice-banner notice-success" role="status">
        <div class="notice-banner-content">
          <i data-lucide="check-circle-2"></i>
          <span><strong>On Track:</strong> Your ${escapeHtml(
            monthLabel
          )} expenses are within budget at ${statusInfo.utilizationPercent.toFixed(
      1
    )}% utilization.</span>
        </div>
      </div>
    `;
  }

  const remainingLabel =
    statusInfo.status === 'exceeded' ? 'Over Budget By' : 'Remaining Budget';
  const remainingDisplay =
    statusInfo.status === 'unset'
      ? '—'
      : formatCurrency(Math.abs(statusInfo.remainingBudget));
  const remainingClass =
    statusInfo.status === 'exceeded'
      ? 'text-expense'
      : statusInfo.status === 'warning'
      ? 'text-warning'
      : statusInfo.status === 'ok'
      ? 'text-income'
      : '';

  const fillClass =
    statusInfo.status === 'exceeded'
      ? 'status-exceeded'
      : statusInfo.status === 'warning'
      ? 'status-warning'
      : 'status-ok';

  const statusText =
    statusInfo.status === 'exceeded'
      ? 'Exceeded'
      : statusInfo.status === 'warning'
      ? 'Warning (80%+)'
      : statusInfo.status === 'ok'
      ? 'Healthy'
      : 'Not Set';

  const categoryTableRows = categoryRows
    .map((row) => {
      let statusBadge = '<span class="meta-inline">No cap</span>';
      if (row.status === 'exceeded') {
        statusBadge = `<span class="type-label text-expense">Exceeded (${row.utilization.toFixed(
          0
        )}%)</span>`;
      } else if (row.status === 'warning') {
        statusBadge = `<span class="type-label text-warning">Warning (${row.utilization.toFixed(
          0
        )}%)</span>`;
      } else if (row.status === 'ok') {
        statusBadge = `<span class="type-label text-income">Within cap (${row.utilization.toFixed(
          0
        )}%)</span>`;
      }

      return `
        <tr>
          <td class="txn-name">${escapeHtml(row.category)}</td>
          <td class="col-right mono">${escapeHtml(formatCurrency(row.spent))}</td>
          <td class="col-right">
            <input
              type="number"
              class="input-control input-mono inline-budget-input"
              data-cat-limit="${escapeHtml(row.category)}"
              value="${row.limit > 0 ? row.limit : ''}"
              placeholder="0.00"
              min="0"
              step="10"
              aria-label="Monthly target for ${escapeHtml(row.category)}"
            />
          </td>
          <td class="col-right">${statusBadge}</td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    ${alertBannerHtml}

    <!-- Budget Summary KPIs -->
    <section class="kpi-grid" aria-label="Budget Summary">
      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Monthly Budget</span>
          <span class="kpi-icon"><i data-lucide="target"></i></span>
        </div>
        <div class="kpi-value">${
          statusInfo.monthlyLimit > 0 ? escapeHtml(formatCurrency(statusInfo.monthlyLimit)) : 'Not Set'
        }</div>
        <div class="kpi-meta">${escapeHtml(monthLabel)} limit</div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Monthly Expenses</span>
          <span class="kpi-icon"><i data-lucide="credit-card"></i></span>
        </div>
        <div class="kpi-value">${escapeHtml(formatCurrency(statusInfo.monthlyExpenses))}</div>
        <div class="kpi-meta">Spent in ${escapeHtml(monthLabel)}</div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">${remainingLabel}</span>
          <span class="kpi-icon"><i data-lucide="wallet"></i></span>
        </div>
        <div class="kpi-value ${remainingClass}">${escapeHtml(remainingDisplay)}</div>
        <div class="kpi-meta">${
          statusInfo.status === 'unset' ? 'Set a monthly limit below' : statusText
        }</div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Budget Utilization</span>
          <span class="kpi-icon"><i data-lucide="gauge"></i></span>
        </div>
        <div class="kpi-value ${remainingClass}">${statusInfo.utilizationPercent.toFixed(1)}%</div>
        <div class="kpi-meta">Warning triggers at 80%</div>
      </article>
    </section>

    <!-- Budget Setup & Progress Tracker -->
    <section class="budget-setup-row">
      <article class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Set Monthly Budget</h2>
            <p class="card-subtitle">Define your overall monthly spending threshold</p>
          </div>
        </div>
        <form id="monthlyBudgetForm" class="budget-form" novalidate>
          <div class="form-group">
            <label for="monthlyBudgetInput" class="form-label">Monthly Limit ($)</label>
            <div class="budget-input-group">
              <input
                type="number"
                id="monthlyBudgetInput"
                class="input-control input-mono"
                value="${statusInfo.monthlyLimit > 0 ? statusInfo.monthlyLimit : ''}"
                placeholder="e.g. 3000.00"
                min="1"
                step="0.01"
                required
              />
              <button type="submit" class="btn btn-primary">Save Budget</button>
            </div>
            <span class="field-error" id="budgetInputError" aria-live="polite"></span>
          </div>
        </form>
      </article>

      <article class="card budget-progress-wrap">
        <div class="progress-header">
          <div>
            <h2 class="card-title">${escapeHtml(monthLabel)} Budget Consumption</h2>
            <p class="card-subtitle">${
              statusInfo.monthlyLimit > 0
                ? `${formatCurrency(statusInfo.monthlyExpenses)} spent of ${formatCurrency(
                    statusInfo.monthlyLimit
                  )}`
                : 'Enter a monthly limit to activate utilization tracking'
            }</p>
          </div>
          <span class="mono ${remainingClass}" style="font-weight: 600;">${statusInfo.utilizationPercent.toFixed(
    1
  )}%</span>
        </div>

        <div
          class="progress-track"
          role="progressbar"
          aria-valuenow="${Math.round(statusInfo.utilizationPercent)}"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Monthly budget utilization"
        >
          <div class="progress-fill ${fillClass}" style="width: ${statusInfo.clampedPercent}%;"></div>
        </div>

        <div class="progress-stats">
          <span>0%</span>
          <span>80% Warning Threshold</span>
          <span>100% Limit</span>
        </div>
      </article>
    </section>

    <!-- Category Budget Allocation Table -->
    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Category Spending &amp; Targets</h2>
          <p class="card-subtitle">Optional per-category monthly caps for ${escapeHtml(
            monthLabel
          )}</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="saveCategoryLimitsBtn">
          Save Category Targets
        </button>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th class="col-right">Spent (${escapeHtml(monthLabel)})</th>
              <th class="col-right">Monthly Target ($)</th>
              <th class="col-right">Status</th>
            </tr>
          </thead>
          <tbody>${categoryTableRows}</tbody>
        </table>
      </div>
    </section>
  `;

  // Monthly budget form handler with validation
  const budgetForm = container.querySelector('#monthlyBudgetForm');
  const budgetInput = container.querySelector('#monthlyBudgetInput');
  const budgetErr = container.querySelector('#budgetInputError');

  if (budgetForm && budgetInput) {
    budgetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = Number(budgetInput.value);
      if (!budgetInput.value || !Number.isFinite(val) || val <= 0) {
        budgetInput.classList.add('is-invalid');
        if (budgetErr) budgetErr.textContent = 'Enter a valid monthly budget greater than 0.';
        return;
      }
      budgetInput.classList.remove('is-invalid');
      if (budgetErr) budgetErr.textContent = '';
      handlers.onSaveMonthlyBudget(val);
    });
  }

  // Category limits save handler
  const saveCatBtn = container.querySelector('#saveCategoryLimitsBtn');
  if (saveCatBtn) {
    saveCatBtn.addEventListener('click', () => {
      const nextLimits = {};
      container.querySelectorAll('[data-cat-limit]').forEach((input) => {
        const val = Number(input.value);
        if (Number.isFinite(val) && val > 0) {
          nextLimits[input.dataset.catLimit] = Number(val.toFixed(2));
        }
      });
      handlers.onSaveCategoryLimits(nextLimits);
    });
  }
}
