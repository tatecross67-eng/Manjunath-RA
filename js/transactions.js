/**
 * transactions.js — Transaction Domain Logic & History View Controller
 * ---------------------------------------------------------------------------
 * Contains pure transaction filtering, sorting, validation, formatting helpers,
 * and the Transaction History view renderer. Independent of storage layer.
 */

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transport',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Shopping',
  'Education',
  'Other',
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Gifts',
  'Refunds',
  'Other',
];

export const ALL_CATEGORIES = Array.from(
  new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])
);

export const CATEGORY_COLORS = {
  Housing: '#1D4ED8',
  Food: '#0F766E',
  Transport: '#0284C7',
  Utilities: '#D97706',
  Entertainment: '#7C3AED',
  Healthcare: '#DC2626',
  Shopping: '#DB2777',
  Education: '#4F46E5',
  Salary: '#16A34A',
  Freelance: '#0D9488',
  Investments: '#2563EB',
  Gifts: '#EA580C',
  Refunds: '#65A30D',
  Other: '#64748B',
};

/**
 * Formats a number as USD currency string.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Formats an ISO YYYY-MM-DD date into a concise readable string.
 * @param {string} isoDate
 * @returns {string}
 */
export function formatDate(isoDate) {
  if (!isoDate) return '—';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const d = new Date(year, month, day);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats YYYY-MM string into readable Month Year label.
 * @param {string} monthKey
 * @returns {string}
 */
export function formatMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '';
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Escapes HTML special characters to prevent XSS in template rendering.
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates transaction form input before saving.
 * @param {Object} input
 * @returns {{ valid: boolean, errors: Object<string, string>, normalized: Object }}
 */
export function validateTransactionInput(input) {
  const errors = {};
  const type = input.type === 'income' ? 'income' : 'expense';
  const title = String(input.title || '').trim();
  const amountNum = Number(input.amount);
  const category = String(input.category || '').trim();
  const date = String(input.date || '').trim();
  const description = String(input.description || '').trim();

  if (title.length < 2) {
    errors.title = 'Enter a title of at least 2 characters.';
  } else if (title.length > 80) {
    errors.title = 'Title must be 80 characters or fewer.';
  }

  if (!input.amount || !Number.isFinite(amountNum) || amountNum <= 0) {
    errors.amount = 'Enter a valid amount greater than 0.';
  } else if (amountNum > 100000000) {
    errors.amount = 'Amount cannot exceed $100,000,000.';
  }

  const validCats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!category || !validCats.includes(category)) {
    errors.category = 'Select a valid category.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Select a valid date.';
  }

  if (description.length > 240) {
    errors.description = 'Description must be 240 characters or fewer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      type,
      title,
      amount: Number(amountNum.toFixed(2)),
      category,
      date,
      description,
    },
  };
}

/**
 * Filters transactions by search query, category, and type.
 * @param {Array<Object>} transactions
 * @param {{ search?: string, category?: string, type?: string }} filters
 * @returns {Array<Object>}
 */
export function filterTransactions(transactions, filters = {}) {
  const query = String(filters.search || '').trim().toLowerCase();
  const category = filters.category || 'all';
  const type = filters.type || 'all';

  return transactions.filter((txn) => {
    if (type !== 'all' && txn.type !== type) return false;
    if (category !== 'all' && txn.category !== category) return false;

    if (query) {
      const haystack = `${txn.title} ${txn.description || ''} ${txn.category}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

/**
 * Sorts transactions by date or amount without mutating the source array.
 * @param {Array<Object>} transactions
 * @param {'date-desc'|'date-asc'|'amount-desc'|'amount-asc'} sortBy
 * @returns {Array<Object>}
 */
export function sortTransactions(transactions, sortBy = 'date-desc') {
  const copy = [...transactions];
  copy.sort((a, b) => {
    if (sortBy === 'date-asc') {
      return a.date.localeCompare(b.date) || a.title.localeCompare(b.title);
    }
    if (sortBy === 'amount-desc') {
      return Number(b.amount) - Number(a.amount);
    }
    if (sortBy === 'amount-asc') {
      return Number(a.amount) - Number(b.amount);
    }
    // Default: newest first
    return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
  });
  return copy;
}

/**
 * Triggers a client-side CSV download of the given transactions.
 * @param {Array<Object>} transactions
 */
export function exportTransactionsCsv(transactions) {
  const headers = ['ID', 'Date', 'Type', 'Title', 'Category', 'Amount', 'Description'];
  const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = sortTransactions(transactions, 'date-desc').map((t) =>
    [
      escapeCsv(t.id),
      escapeCsv(t.date),
      escapeCsv(t.type),
      escapeCsv(t.title),
      escapeCsv(t.category),
      Number(t.amount).toFixed(2),
      escapeCsv(t.description),
    ].join(',')
  );

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `clearledger-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Renders the Transaction History view with search, filters, sorting, and row actions.
 * @param {HTMLElement} container
 * @param {Object} state
 * @param {Object} handlers
 */
export function renderTransactionsView(container, state, handlers) {
  const { transactions, filters } = state;
  const filtered = sortTransactions(
    filterTransactions(transactions, filters),
    filters.sortBy
  );

  const categoryOptions = ALL_CATEGORIES.map(
    (cat) =>
      `<option value="${escapeHtml(cat)}" ${
        filters.category === cat ? 'selected' : ''
      }>${escapeHtml(cat)}</option>`
  ).join('');

  const hasActiveFilters =
    Boolean(filters.search) || filters.category !== 'all' || filters.type !== 'all';

  let tableContent = '';

  if (transactions.length === 0) {
    tableContent = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="receipt"></i></div>
        <h3 class="empty-title">No transactions recorded yet</h3>
        <p class="empty-desc">Start logging your income and expenses to build your financial history.</p>
        <button type="button" class="btn btn-primary" id="emptyAddTxnBtn">
          <i data-lucide="plus"></i>
          <span>Log First Transaction</span>
        </button>
      </div>
    `;
  } else if (filtered.length === 0) {
    tableContent = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="search-x"></i></div>
        <h3 class="empty-title">No matching transactions</h3>
        <p class="empty-desc">Try adjusting your search keywords, type filter, or selected category.</p>
        <button type="button" class="btn btn-secondary" id="clearFiltersBtn">Reset Filters</button>
      </div>
    `;
  } else {
    const rowsHtml = filtered
      .map((txn) => {
        const isIncome = txn.type === 'income';
        const sign = isIncome ? '+' : '-';
        const amountClass = isIncome ? 'text-income' : 'text-expense';
        const typeLabel = isIncome ? 'Income' : 'Expense';
        return `
          <tr>
            <td class="mono meta-inline">${escapeHtml(formatDate(txn.date))}</td>
            <td>
              <div class="txn-title-cell">
                <span class="txn-name">${escapeHtml(txn.title)}</span>
                ${
                  txn.description
                    ? `<span class="txn-desc" title="${escapeHtml(txn.description)}">${escapeHtml(
                        txn.description
                      )}</span>`
                    : ''
                }
              </div>
            </td>
            <td class="meta-inline">${escapeHtml(txn.category)}</td>
            <td><span class="type-label ${amountClass}">${typeLabel}</span></td>
            <td class="col-right mono ${amountClass}">${sign}${escapeHtml(
          formatCurrency(txn.amount)
        )}</td>
            <td class="col-right">
              <div class="row-actions">
                <button
                  type="button"
                  class="icon-btn"
                  data-action="edit"
                  data-id="${escapeHtml(txn.id)}"
                  aria-label="Edit ${escapeHtml(txn.title)}"
                  title="Edit"
                >
                  <i data-lucide="pencil"></i>
                </button>
                <button
                  type="button"
                  class="icon-btn icon-btn-danger"
                  data-action="delete"
                  data-id="${escapeHtml(txn.id)}"
                  aria-label="Delete ${escapeHtml(txn.title)}"
                  title="Delete"
                >
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tableContent = `
      <div class="table-summary-bar">
        <span>Showing <strong class="tabular-nums">${filtered.length}</strong> of <strong class="tabular-nums">${transactions.length}</strong> transactions</span>
        ${
          hasActiveFilters
            ? '<button type="button" class="link-btn" id="inlineResetFiltersBtn">Reset filters</button>'
            : ''
        }
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Transaction</th>
              <th>Category</th>
              <th>Type</th>
              <th class="col-right">Amount</th>
              <th class="col-right">Actions</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = `
    <section class="card">
      <div class="filter-toolbar">
        <div class="filter-controls">
          <div class="search-box">
            <i data-lucide="search"></i>
            <input
              type="search"
              id="txnSearchInput"
              class="input-control input-compact"
              placeholder="Search title, note, or category..."
              value="${escapeHtml(filters.search)}"
              aria-label="Search transactions"
            />
          </div>

          <div class="segmented-control" role="group" aria-label="Filter by type">
            <button type="button" class="segment-btn ${
              filters.type === 'all' ? 'active' : ''
            }" data-filter-type="all">All</button>
            <button type="button" class="segment-btn ${
              filters.type === 'income' ? 'active' : ''
            }" data-filter-type="income">Income</button>
            <button type="button" class="segment-btn ${
              filters.type === 'expense' ? 'active' : ''
            }" data-filter-type="expense">Expense</button>
          </div>

          <select id="txnCategoryFilter" class="input-control input-compact filter-select" aria-label="Filter by category">
            <option value="all" ${filters.category === 'all' ? 'selected' : ''}>All Categories</option>
            ${categoryOptions}
          </select>

          <select id="txnSortSelect" class="input-control input-compact filter-select" aria-label="Sort transactions">
            <option value="date-desc" ${filters.sortBy === 'date-desc' ? 'selected' : ''}>Newest First</option>
            <option value="date-asc" ${filters.sortBy === 'date-asc' ? 'selected' : ''}>Oldest First</option>
            <option value="amount-desc" ${filters.sortBy === 'amount-desc' ? 'selected' : ''}>Highest Amount</option>
            <option value="amount-asc" ${filters.sortBy === 'amount-asc' ? 'selected' : ''}>Lowest Amount</option>
          </select>
        </div>
      </div>

      ${tableContent}
    </section>
  `;

  // Bind search & filter listeners
  const searchInput = container.querySelector('#txnSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      handlers.onFilterChange({ search: e.target.value });
    });
    // Preserve focus and cursor position during live search re-renders
    if (document.activeElement?.id !== 'txnSearchInput' && state.focusSearch) {
      searchInput.focus();
      const len = searchInput.value.length;
      searchInput.setSelectionRange(len, len);
    }
  }

  container.querySelectorAll('[data-filter-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onFilterChange({ type: btn.dataset.filterType });
    });
  });

  const catFilter = container.querySelector('#txnCategoryFilter');
  if (catFilter) {
    catFilter.addEventListener('change', (e) => {
      handlers.onFilterChange({ category: e.target.value });
    });
  }

  const sortSelect = container.querySelector('#txnSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      handlers.onFilterChange({ sortBy: e.target.value });
    });
  }

  const clearBtn = container.querySelector('#clearFiltersBtn') || container.querySelector('#inlineResetFiltersBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      handlers.onFilterChange({ search: '', category: 'all', type: 'all', sortBy: 'date-desc' });
    });
  }

  const emptyAddBtn = container.querySelector('#emptyAddTxnBtn');
  if (emptyAddBtn) {
    emptyAddBtn.addEventListener('click', () => handlers.onOpenAddModal());
  }

  // Delegate Edit / Delete row button clicks
  container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onEditTransaction(btn.dataset.id));
  });

  container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onDeleteTransaction(btn.dataset.id));
  });
}
