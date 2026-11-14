/**
 * insights.js — Smart Money Insights Domain Calculations & View Renderer
 * ---------------------------------------------------------------------------
 * Analyzes income and expense history dynamically to generate personalized
 * spending patterns, monthly comparisons, anomaly alerts, month-end projections,
 * and data-driven saving recommendations without external AI or hardcoded numbers.
 */

import {
  CATEGORY_COLORS,
  escapeHtml,
  formatCurrency,
  formatDate,
  formatMonthLabel,
} from './transactions.js';

/**
 * Returns previous month string YYYY-MM given targetMonth YYYY-MM.
 * @param {string} targetMonth YYYY-MM
 * @returns {string} YYYY-MM
 */
export function getPreviousMonth(targetMonth) {
  const [y, m] = (targetMonth || new Date().toISOString().slice(0, 7))
    .split('-')
    .map(Number);
  const prevDate = new Date(y, m - 2, 1);
  const py = prevDate.getFullYear();
  const pm = String(prevDate.getMonth() + 1).padStart(2, '0');
  return `${py}-${pm}`;
}

/**
 * Computes number of days in a given YYYY-MM month.
 * @param {string} monthKey YYYY-MM
 * @returns {number}
 */
export function getDaysInMonth(monthKey) {
  const [y, m] = (monthKey || new Date().toISOString().slice(0, 7))
    .split('-')
    .map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Requirement 1: Spending Patterns Analysis
 * @param {Array<Object>} transactions
 * @param {string} targetMonth YYYY-MM
 */
export function calculateSpendingPatterns(transactions, targetMonth) {
  const currentMonth = targetMonth || new Date().toISOString().slice(0, 7);
  const monthlyExpenses = transactions.filter(
    (t) => t.type === 'expense' && String(t.date || '').startsWith(currentMonth)
  );

  const totalSpent = monthlyExpenses.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  // 1. Highest Spending Category
  const catMap = new Map();
  for (const t of monthlyExpenses) {
    const amt = Number(t.amount) || 0;
    catMap.set(t.category, (catMap.get(t.category) || 0) + amt);
  }

  const categoryRanking = Array.from(catMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
      color: CATEGORY_COLORS[category] || '#64748B',
    }))
    .sort((a, b) => b.amount - a.amount);

  const highestCategory = categoryRanking.length > 0 ? categoryRanking[0] : null;

  // 2. Spending by Day of Week & Period of Month
  const dayTotals = {
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0,
    Sunday: 0,
  };
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Spending by Period: Early (1-10), Mid (11-20), Late (21-end)
  const periods = {
    'Early Month (1st–10th)': 0,
    'Mid Month (11th–20th)': 0,
    'Late Month (21st–End)': 0,
  };

  for (const t of monthlyExpenses) {
    if (!t.date) continue;
    const [y, m, d] = t.date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    if (isNaN(dateObj.getTime())) continue;

    const weekday = dayNames[dateObj.getDay()];
    const amt = Number(t.amount) || 0;
    if (dayTotals[weekday] !== undefined) {
      dayTotals[weekday] += amt;
    }

    if (d <= 10) periods['Early Month (1st–10th)'] += amt;
    else if (d <= 20) periods['Mid Month (11th–20th)'] += amt;
    else periods['Late Month (21st–End)'] += amt;
  }

  const sortedDays = Object.entries(dayTotals).sort((a, b) => b[1] - a[1]);
  const highestDay = sortedDays.length > 0 && sortedDays[0][1] > 0
    ? { day: sortedDays[0][0], amount: sortedDays[0][1] }
    : null;

  const sortedPeriods = Object.entries(periods).sort((a, b) => b[1] - a[1]);
  const highestPeriod = sortedPeriods.length > 0 && sortedPeriods[0][1] > 0
    ? { period: sortedPeriods[0][0], amount: sortedPeriods[0][1] }
    : null;

  // 3. Average Daily and Weekly Expenses
  const now = new Date();
  const currentIsoMonth = now.toISOString().slice(0, 7);
  const totalDaysInMonth = getDaysInMonth(currentMonth);

  let daysElapsed = totalDaysInMonth;
  if (currentMonth === currentIsoMonth) {
    daysElapsed = Math.max(1, Math.min(totalDaysInMonth, now.getDate()));
  }

  const averageDaily = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
  const averageWeekly = averageDaily * 7;

  return {
    totalSpent,
    expenseCount: monthlyExpenses.length,
    highestCategory,
    categoryRanking,
    highestDay,
    highestPeriod,
    daysElapsed,
    totalDaysInMonth,
    averageDaily,
    averageWeekly,
  };
}

/**
 * Requirement 2: Monthly Comparisons
 * @param {Array<Object>} transactions
 * @param {string} targetMonth YYYY-MM
 */
export function calculateMonthlyComparison(transactions, targetMonth) {
  const currentMonth = targetMonth || new Date().toISOString().slice(0, 7);
  const previousMonth = getPreviousMonth(currentMonth);

  const currentExpenses = transactions.filter(
    (t) => t.type === 'expense' && String(t.date || '').startsWith(currentMonth)
  );
  const previousExpenses = transactions.filter(
    (t) => t.type === 'expense' && String(t.date || '').startsWith(previousMonth)
  );

  const currentTotal = currentExpenses.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const previousTotal = previousExpenses.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const hasPreviousData = previousExpenses.length > 0;
  let percentChange = null;
  let absoluteDifference = currentTotal - previousTotal;

  if (hasPreviousData && previousTotal > 0) {
    percentChange = ((currentTotal - previousTotal) / previousTotal) * 100;
  }

  // Category-wise comparisons
  const currentCatTotals = new Map();
  for (const t of currentExpenses) {
    currentCatTotals.set(t.category, (currentCatTotals.get(t.category) || 0) + (Number(t.amount) || 0));
  }

  const previousCatTotals = new Map();
  for (const t of previousExpenses) {
    previousCatTotals.set(t.category, (previousCatTotals.get(t.category) || 0) + (Number(t.amount) || 0));
  }

  const allCategories = Array.from(
    new Set([...currentCatTotals.keys(), ...previousCatTotals.keys()])
  );

  const categoryComparisons = allCategories.map((category) => {
    const cur = currentCatTotals.get(category) || 0;
    const prev = previousCatTotals.get(category) || 0;
    const diff = cur - prev;
    let pct = null;
    if (prev > 0) {
      pct = ((cur - prev) / prev) * 100;
    } else if (cur > 0 && prev === 0) {
      pct = 100; // New expense category
    }

    return {
      category,
      current: cur,
      previous: prev,
      diff,
      pct,
      color: CATEGORY_COLORS[category] || '#64748B',
    };
  }).sort((a, b) => b.diff - a.diff);

  return {
    currentMonth,
    previousMonth,
    currentTotal,
    previousTotal,
    hasPreviousData,
    percentChange,
    absoluteDifference,
    categoryComparisons,
  };
}

/**
 * Requirement 3: Unusual Spending Alerts
 * @param {Array<Object>} transactions
 * @param {string} targetMonth YYYY-MM
 * @param {Object} monthlyComparison
 */
export function detectUnusualSpending(transactions, targetMonth, monthlyComparison) {
  const currentMonth = targetMonth || new Date().toISOString().slice(0, 7);
  const currentExpenses = transactions.filter(
    (t) => t.type === 'expense' && String(t.date || '').startsWith(currentMonth)
  );

  const allExpenses = transactions.filter((t) => t.type === 'expense');

  const alerts = [];

  if (allExpenses.length >= 3 && currentExpenses.length > 0) {
    // 1. Calculate overall historical median/average expense amount
    const amounts = allExpenses.map((t) => Number(t.amount) || 0);
    const avgExpense = amounts.reduce((a, b) => a + b, 0) / amounts.length;

    // A transaction is flagged unusual if it is >= 2.5x the average AND > $100
    for (const t of currentExpenses) {
      const amt = Number(t.amount) || 0;
      if (amt >= avgExpense * 2.5 && amt >= 100) {
        const factor = (amt / avgExpense).toFixed(1);
        alerts.push({
          type: 'large-transaction',
          severity: 'warning',
          title: `Unusually High Transaction: "${t.title}"`,
          description: `Spent ${formatCurrency(amt)} on ${formatDate(t.date)} in ${t.category}. This is ${factor}x higher than your average expense (${formatCurrency(avgExpense)}).`,
          transaction: t,
        });
      }
    }
  }

  // 2. Detect category surges from monthly comparison
  if (monthlyComparison?.hasPreviousData) {
    for (const cat of monthlyComparison.categoryComparisons) {
      // If category spending rose by > 30% with an increase of at least $50
      if (cat.previous > 0 && cat.pct !== null && cat.pct >= 30 && cat.diff >= 50) {
        alerts.push({
          type: 'category-surge',
          severity: 'danger',
          title: `Spending Surge in ${cat.category}`,
          description: `You have spent ${formatCurrency(cat.current)} this month compared to ${formatCurrency(cat.previous)} last month—a ${cat.pct.toFixed(0)}% increase (+${formatCurrency(cat.diff)}).`,
          category: cat.category,
        });
      }
    }
  }

  return alerts;
}

/**
 * Requirement 4: Month-End Spending Prediction
 * @param {Array<Object>} transactions
 * @param {Object} budget
 * @param {string} targetMonth YYYY-MM
 */
export function calculateMonthEndPrediction(transactions, budget, targetMonth) {
  const currentMonth = targetMonth || new Date().toISOString().slice(0, 7);
  const now = new Date();
  const currentIsoMonth = now.toISOString().slice(0, 7);
  const totalDays = getDaysInMonth(currentMonth);

  const monthlyExpenses = transactions.filter(
    (t) => t.type === 'expense' && String(t.date || '').startsWith(currentMonth)
  );

  const spentSoFar = monthlyExpenses.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const isCurrentMonth = currentMonth === currentIsoMonth;
  let daysElapsed = totalDays;
  if (isCurrentMonth) {
    daysElapsed = Math.max(1, Math.min(totalDays, now.getDate()));
  }

  const dailyRate = daysElapsed > 0 ? spentSoFar / daysElapsed : 0;
  const remainingDays = isCurrentMonth ? Math.max(0, totalDays - daysElapsed) : 0;
  const projectedTotal = isCurrentMonth ? spentSoFar + dailyRate * remainingDays : spentSoFar;

  const monthlyLimit = Number(budget?.monthlyLimit) || 0;
  const hasBudget = monthlyLimit > 0;
  let budgetVariance = null;
  let status = 'normal';

  if (hasBudget) {
    budgetVariance = monthlyLimit - projectedTotal;
    if (projectedTotal > monthlyLimit) {
      status = 'will-exceed';
    } else if (projectedTotal >= monthlyLimit * 0.85) {
      status = 'near-limit';
    } else {
      status = 'on-track';
    }
  }

  return {
    isCurrentMonth,
    daysElapsed,
    totalDays,
    remainingDays,
    spentSoFar,
    dailyRate,
    projectedTotal,
    monthlyLimit,
    hasBudget,
    budgetVariance,
    status,
  };
}

/**
 * Requirement 5: Personalized Saving Suggestions
 * @param {Object} patterns
 * @param {Object} comparison
 * @param {Object} prediction
 */
export function generatePersonalizedSuggestions(patterns, comparison, prediction) {
  const suggestions = [];

  // Suggestion 1: Highest category optimization
  if (patterns.highestCategory && patterns.highestCategory.amount > 0) {
    const isDiscretionary = ['Food', 'Shopping', 'Entertainment'].includes(patterns.highestCategory.category);
    const saveTarget = patterns.highestCategory.amount * 0.15;

    suggestions.push({
      variant: 'positive',
      icon: 'sparkles',
      title: `Optimize ${patterns.highestCategory.category} Spending`,
      text: `${patterns.highestCategory.category} is your largest expense (${formatCurrency(patterns.highestCategory.amount)}, ${patterns.highestCategory.percentage.toFixed(0)}% of monthly total). Reducing this category by just 15% would save you ${formatCurrency(saveTarget)} this month.`,
    });
  }

  // Suggestion 2: Budget overage warning and trimming suggestion
  if (prediction.hasBudget && prediction.status === 'will-exceed') {
    const overage = Math.abs(prediction.budgetVariance);
    const weeklyTrim = prediction.remainingDays > 0 ? overage / (prediction.remainingDays / 7) : overage;

    suggestions.push({
      variant: 'danger',
      icon: 'alert-triangle',
      title: 'Action Needed: Stay Within Monthly Budget',
      text: `At your current pace of ${formatCurrency(prediction.dailyRate)}/day, you are projected to exceed your ${formatCurrency(prediction.monthlyLimit)} budget by approximately ${formatCurrency(overage)}. Trimming ~${formatCurrency(weeklyTrim)} per week on non-essential categories will keep you balanced.`,
    });
  } else if (prediction.hasBudget && prediction.status === 'on-track') {
    suggestions.push({
      variant: 'positive',
      icon: 'check-circle-2',
      title: 'Healthy Budget Pacing',
      text: `You are spending responsibly! Projected month-end expenses (${formatCurrency(prediction.projectedTotal)}) are well below your ${formatCurrency(prediction.monthlyLimit)} limit, leaving you with an estimated ${formatCurrency(prediction.budgetVariance)} in savings.`,
    });
  }

  // Suggestion 3: Month-over-month increase feedback
  if (comparison.hasPreviousData && comparison.percentChange !== null) {
    if (comparison.percentChange > 15) {
      const topSurge = comparison.categoryComparisons.find((c) => c.pct !== null && c.pct > 20);
      const catText = topSurge
        ? ` Primarily driven by ${topSurge.category} (+${topSurge.pct.toFixed(0)}%).`
        : '';
      suggestions.push({
        variant: 'warning',
        icon: 'trending-up',
        title: 'Spending Up vs. Last Month',
        text: `Your overall spending increased by ${comparison.percentChange.toFixed(1)}% (+${formatCurrency(comparison.absoluteDifference)}) compared to last month.${catText} Consider reviewing recent purchases to curb unnecessary expenses.`,
      });
    } else if (comparison.percentChange < -5) {
      suggestions.push({
        variant: 'positive',
        icon: 'trending-down',
        title: 'Spending Reduced vs. Last Month',
        text: `Commendable discipline! Your total expenses are down by ${Math.abs(comparison.percentChange).toFixed(1)}% (-${formatCurrency(Math.abs(comparison.absoluteDifference))}) compared to last month.`,
      });
    }
  }

  // Suggestion 4: Weekend or Peak Day Spending Tip
  if (patterns.highestDay && patterns.highestDay.amount > 0) {
    const isWeekend = ['Saturday', 'Sunday', 'Friday'].includes(patterns.highestDay.day);
    if (isWeekend) {
      suggestions.push({
        variant: 'info',
        icon: 'calendar',
        title: `Peak Outflow on ${patterns.highestDay.day}s`,
        text: `You log your highest spending on ${patterns.highestDay.day}s (${formatCurrency(patterns.highestDay.amount)} this month). Planning weekend activities and dining ahead can prevent impulse spending.`,
      });
    }
  }

  return suggestions;
}

/**
 * Renders the Smart Money Insights view into the main content container.
 * @param {HTMLElement} container
 * @param {Object} state
 * @param {Object} handlers
 */
export function renderInsightsView(container, state, handlers) {
  const { transactions, budget, activeMonth } = state;
  const monthLabel = formatMonthLabel(activeMonth);

  // Filter expenses for current month
  const monthlyExpenses = transactions.filter(
    (t) => t.type === 'expense' && String(t.date || '').startsWith(activeMonth)
  );

  // Empty state handling
  if (transactions.length === 0 || monthlyExpenses.length === 0) {
    container.innerHTML = `
      <section class="card">
        <div class="empty-state" style="padding: 60px 20px;">
          <div class="empty-icon"><i data-lucide="sparkles"></i></div>
          <h3 class="empty-title">Insufficient Data for ${escapeHtml(monthLabel)}</h3>
          <p class="empty-desc">
            Smart Money Insights dynamically analyzes your spending patterns, predicts month-end totals, and provides saving suggestions. Log expenses for this month to unlock automated insights.
          </p>
          <button type="button" class="btn btn-primary" id="insightsAddTxnBtn">
            <i data-lucide="plus"></i>
            <span>Log an Expense</span>
          </button>
        </div>
      </section>
    `;
    container.querySelector('#insightsAddTxnBtn')?.addEventListener('click', () => {
      handlers.onOpenAddModal();
    });
    return;
  }

  // Calculate all 5 insight domains
  const patterns = calculateSpendingPatterns(transactions, activeMonth);
  const comparison = calculateMonthlyComparison(transactions, activeMonth);
  const alerts = detectUnusualSpending(transactions, activeMonth, comparison);
  const prediction = calculateMonthEndPrediction(transactions, budget, activeMonth);
  const suggestions = generatePersonalizedSuggestions(patterns, comparison, prediction);

  // 1. Month-End Spending Prediction Card
  let predictionStatusBadge = '';
  let predictionBanner = '';
  if (prediction.hasBudget) {
    if (prediction.status === 'will-exceed') {
      predictionStatusBadge = `<span class="type-label text-expense">Exceeds Budget</span>`;
      predictionBanner = `
        <div class="notice-banner notice-danger" style="margin-top: 12px;">
          <div class="notice-banner-content">
            <i data-lucide="alert-octagon"></i>
            <span><strong>Budget Risk:</strong> At your current pace, you will exceed your ${formatCurrency(prediction.monthlyLimit)} budget by approx. <strong>${formatCurrency(Math.abs(prediction.budgetVariance))}</strong>.</span>
          </div>
        </div>
      `;
    } else if (prediction.status === 'near-limit') {
      predictionStatusBadge = `<span class="type-label text-warning">Close to Limit</span>`;
      predictionBanner = `
        <div class="notice-banner notice-warning" style="margin-top: 12px;">
          <div class="notice-banner-content">
            <i data-lucide="alert-triangle"></i>
            <span><strong>Caution:</strong> Spending is tracking near your ${formatCurrency(prediction.monthlyLimit)} monthly limit (~${formatCurrency(prediction.budgetVariance)} remaining).</span>
          </div>
        </div>
      `;
    } else {
      predictionStatusBadge = `<span class="type-label text-income">Within Budget</span>`;
      predictionBanner = `
        <div class="notice-banner notice-success" style="margin-top: 12px;">
          <div class="notice-banner-content">
            <i data-lucide="check-circle-2"></i>
            <span><strong>On Target:</strong> Projected spending is safely within your ${formatCurrency(prediction.monthlyLimit)} budget limit (~${formatCurrency(prediction.budgetVariance)} projected savings).</span>
          </div>
        </div>
      `;
    }
  } else {
    predictionStatusBadge = `<span class="meta-inline">No Budget Set</span>`;
  }

  // 2. Monthly Comparison Section
  let comparisonContent = '';
  if (!comparison.hasPreviousData) {
    comparisonContent = `
      <div class="notice-banner notice-warning">
        <div class="notice-banner-content">
          <i data-lucide="info"></i>
          <span><strong>Previous Month Data Needed:</strong> Monthly comparisons will automatically activate once you have expenses logged across at least two different months.</span>
        </div>
      </div>
    `;
  } else {
    const isIncrease = comparison.percentChange > 0;
    const changeSign = isIncrease ? '+' : '';
    const changeClass = isIncrease ? 'text-expense' : 'text-income';
    const changeIcon = isIncrease ? 'trending-up' : 'trending-down';

    const topCategoriesHtml = comparison.categoryComparisons
      .slice(0, 4)
      .map((cat) => {
        const catChange = cat.pct !== null ? `${cat.pct > 0 ? '+' : ''}${cat.pct.toFixed(0)}%` : 'New';
        const catClass = (cat.pct || 0) > 0 ? 'text-expense' : 'text-income';
        return `
          <div class="category-comparison-item">
            <div class="legend-name-wrap">
              <span class="legend-swatch" style="background-color: ${cat.color};"></span>
              <span class="txn-name">${escapeHtml(cat.category)}</span>
            </div>
            <div class="comparison-values">
              <span class="mono">${formatCurrency(cat.current)}</span>
              <span class="type-label ${catClass}">${catChange}</span>
            </div>
          </div>
        `;
      })
      .join('');

    comparisonContent = `
      <div class="comparison-overview-grid">
        <div class="comparison-metric">
          <span class="kpi-label">This Month vs. Last Month</span>
          <div class="comparison-change-row ${changeClass}">
            <i data-lucide="${changeIcon}"></i>
            <span class="comparison-pct">${changeSign}${comparison.percentChange.toFixed(1)}%</span>
            <span class="comparison-amt">(${changeSign}${formatCurrency(comparison.absoluteDifference)})</span>
          </div>
          <span class="kpi-meta">${formatMonthLabel(comparison.currentMonth)} (${formatCurrency(comparison.currentTotal)}) vs. ${formatMonthLabel(comparison.previousMonth)} (${formatCurrency(comparison.previousTotal)})</span>
        </div>
        <div class="comparison-categories-wrap">
          <span class="form-label" style="margin-bottom: 8px;">Key Category Shifts</span>
          <div class="category-comparison-list">${topCategoriesHtml}</div>
        </div>
      </div>
    `;
  }

  // 3. Unusual Spending Alerts
  let alertsHtml = '';
  if (alerts.length === 0) {
    alertsHtml = `
      <div class="notice-banner notice-success">
        <div class="notice-banner-content">
          <i data-lucide="shield-check"></i>
          <span><strong>No Anomalies Detected:</strong> All transactions and category totals for ${escapeHtml(monthLabel)} appear consistent with your normal spending baseline.</span>
        </div>
      </div>
    `;
  } else {
    alertsHtml = alerts
      .map(
        (a) => `
        <div class="notice-banner ${a.severity === 'danger' ? 'notice-danger' : 'notice-warning'}" style="margin-bottom: 10px;">
          <div class="notice-banner-content">
            <i data-lucide="${a.severity === 'danger' ? 'alert-octagon' : 'alert-triangle'}"></i>
            <span><strong>${escapeHtml(a.title)}:</strong> ${escapeHtml(a.description)}</span>
          </div>
        </div>
      `
      )
      .join('');
  }

  // 4. Personalized Suggestions Cards
  const suggestionsHtml = suggestions
    .map((s) => {
      let borderClass = 'insight-info';
      if (s.variant === 'positive') borderClass = 'insight-positive';
      else if (s.variant === 'danger') borderClass = 'insight-danger';
      else if (s.variant === 'warning') borderClass = 'insight-warning';

      return `
        <article class="insight-card ${borderClass}">
          <div class="insight-header">
            <span class="insight-icon"><i data-lucide="${s.icon}"></i></span>
            <h3 class="insight-title">${escapeHtml(s.title)}</h3>
          </div>
          <p class="insight-text">${escapeHtml(s.text)}</p>
        </article>
      `;
    })
    .join('');

  container.innerHTML = `
    <!-- Top KPI Highlights: Spending Patterns -->
    <section class="kpi-grid" aria-label="Spending Patterns Highlights">
      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Highest-Spending Category</span>
          <span class="kpi-icon"><i data-lucide="pie-chart"></i></span>
        </div>
        <div class="kpi-value kpi-value-sm">
          ${patterns.highestCategory ? escapeHtml(patterns.highestCategory.category) : '—'}
        </div>
        <div class="kpi-meta">
          ${
            patterns.highestCategory
              ? `${formatCurrency(patterns.highestCategory.amount)} · ${patterns.highestCategory.percentage.toFixed(0)}% of total`
              : 'No expenses recorded'
          }
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Peak Spending Day</span>
          <span class="kpi-icon"><i data-lucide="calendar"></i></span>
        </div>
        <div class="kpi-value kpi-value-sm">
          ${patterns.highestDay ? escapeHtml(patterns.highestDay.day) : '—'}
        </div>
        <div class="kpi-meta">
          ${
            patterns.highestDay
              ? `${formatCurrency(patterns.highestDay.amount)} spent on ${patterns.highestDay.day}s`
              : 'Evenly distributed'
          }
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Average Daily Outflow</span>
          <span class="kpi-icon"><i data-lucide="activity"></i></span>
        </div>
        <div class="kpi-value">${formatCurrency(patterns.averageDaily)}</div>
        <div class="kpi-meta">Over ${patterns.daysElapsed} days evaluated</div>
      </article>

      <article class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">Average Weekly Outflow</span>
          <span class="kpi-icon"><i data-lucide="clock"></i></span>
        </div>
        <div class="kpi-value">${formatCurrency(patterns.averageWeekly)}</div>
        <div class="kpi-meta">Based on current pace</div>
      </article>
    </section>

    <!-- Month-End Prediction Card -->
    <section class="card" style="margin-top: 24px;">
      <div class="card-header">
        <div>
          <h2 class="card-title">Month-End Spending Projection (${escapeHtml(monthLabel)})</h2>
          <p class="card-subtitle">
            Estimated outcome based on your current burn rate of ${formatCurrency(prediction.dailyRate)}/day
          </p>
        </div>
        ${predictionStatusBadge}
      </div>

      <div class="prediction-grid">
        <div class="prediction-stat-box">
          <span class="kpi-label">Spent So Far</span>
          <span class="prediction-stat-val">${formatCurrency(prediction.spentSoFar)}</span>
          <span class="kpi-meta">${prediction.daysElapsed} of ${prediction.totalDays} days</span>
        </div>

        <div class="prediction-stat-box">
          <span class="kpi-label">Projected Month-End</span>
          <span class="prediction-stat-val text-expense">${formatCurrency(prediction.projectedTotal)}</span>
          <span class="kpi-meta">Forecast at current pace</span>
        </div>

        <div class="prediction-stat-box">
          <span class="kpi-label">Monthly Budget</span>
          <span class="prediction-stat-val">${prediction.hasBudget ? formatCurrency(prediction.monthlyLimit) : 'Not Set'}</span>
          <span class="kpi-meta">${prediction.hasBudget ? `${escapeHtml(monthLabel)} limit` : 'Define in Budget tab'}</span>
        </div>
      </div>

      ${predictionBanner}
      <div class="prediction-disclaimer">
        <i data-lucide="info"></i>
        <span>* Projections are algorithmic estimates based on your spending rate to date and do not guarantee final monthly results.</span>
      </div>
    </section>

    <!-- Unusual Spending & Alerts Section -->
    <section class="card" style="margin-top: 24px;">
      <div class="card-header">
        <div>
          <h2 class="card-title">Unusual Spending &amp; Anomaly Alerts</h2>
          <p class="card-subtitle">Automated detection of transaction outliers and category surges</p>
        </div>
      </div>
      ${alertsHtml}
    </section>

    <!-- Monthly Comparison Section -->
    <section class="card" style="margin-top: 24px;">
      <div class="card-header">
        <div>
          <h2 class="card-title">Monthly Spending Shift</h2>
          <p class="card-subtitle">Comparison against previous month (${escapeHtml(formatMonthLabel(comparison.previousMonth))})</p>
        </div>
      </div>
      ${comparisonContent}
    </section>

    <!-- Personalized Saving Suggestions Grid -->
    <section style="margin-top: 24px;">
      <div class="card-header" style="margin-bottom: 12px;">
        <div>
          <h2 class="card-title">Personalized Saving Suggestions</h2>
          <p class="card-subtitle">Practical steps based on your actual income, expenses, and budget</p>
        </div>
      </div>
      <div class="suggestions-grid">
        ${suggestionsHtml}
      </div>
    </section>
  `;

  // Bind icons
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
