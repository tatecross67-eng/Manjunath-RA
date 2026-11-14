/**
 * app.js — Application Shell, Routing, Modals & State Orchestrator
 * ---------------------------------------------------------------------------
 * Coordinates navigation across Dashboard, Transactions, Analytics, and Budget,
 * handles Add/Edit/Delete transaction modals with validation, and keeps UI synced
 * with the REST API persistence layer.
 */

import * as storage from './storage.js';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  escapeHtml,
  exportTransactionsCsv,
  renderTransactionsView,
  validateTransactionInput,
} from './transactions.js';
import { destroyDashboardCharts, renderDashboardView } from './dashboard.js';
import { destroyAnalyticsCharts, renderAnalyticsView } from './analytics.js';
import { renderBudgetView } from './budget.js';
import { renderInsightsView } from './insights.js';

const VIEW_META = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Financial overview and monthly activity',
  },
  transactions: {
    title: 'Transaction History',
    subtitle: 'Search, filter, sort, and manage your entries',
  },
  analytics: {
    title: 'Expense Analytics',
    subtitle: 'Category distribution, cash flow trends, and savings',
  },
  budget: {
    title: 'Budget Management',
    subtitle: 'Monthly spending limits and utilization alerts',
  },
  insights: {
    title: 'Smart Money Insights',
    subtitle: 'Automated spending patterns, trends, and budget forecasting',
  },
};

function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const state = {
  activeView: 'dashboard',
  activeMonth: getTodayIsoDate().slice(0, 7),
  analyticsTimeframe: '6-months',
  filters: {
    search: '',
    category: 'all',
    type: 'all',
    sortBy: 'date-desc',
  },
  focusSearch: false,
  pendingDeleteId: null,
  transactions: [],
  budget: { monthlyLimit: 0, categoryLimits: {}, updatedAt: null, id: null },
  backendError: null,
};

// DOM References
const els = {
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),
  openSidebarBtn: document.getElementById('openSidebarBtn'),
  closeSidebarBtn: document.getElementById('closeSidebarBtn'),
  brandHomeLink: document.getElementById('brandHomeLink'),
  globalMonthSelect: document.getElementById('globalMonthSelect'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  resetSampleBtn: document.getElementById('resetSampleBtn'),
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),
  mainContent: document.getElementById('mainContent'),
  openAddModalBtn: document.getElementById('openAddModalBtn'),

  // Add/Edit Transaction Modal
  transactionModal: document.getElementById('transactionModal'),
  transactionModalTitle: document.getElementById('transactionModalTitle'),
  closeTransactionModalBtn: document.getElementById('closeTransactionModalBtn'),
  cancelTransactionBtn: document.getElementById('cancelTransactionBtn'),
  transactionForm: document.getElementById('transactionForm'),
  txnId: document.getElementById('txnId'),
  txnType: document.getElementById('txnType'),
  typeExpenseBtn: document.getElementById('typeExpenseBtn'),
  typeIncomeBtn: document.getElementById('typeIncomeBtn'),
  txnTitle: document.getElementById('txnTitle'),
  txnAmount: document.getElementById('txnAmount'),
  txnCategory: document.getElementById('txnCategory'),
  txnDate: document.getElementById('txnDate'),
  txnDescription: document.getElementById('txnDescription'),
  saveTransactionBtn: document.getElementById('saveTransactionBtn'),
  errTitle: document.getElementById('errTitle'),
  errAmount: document.getElementById('errAmount'),
  errCategory: document.getElementById('errCategory'),
  errDate: document.getElementById('errDate'),
  errDescription: document.getElementById('errDescription'),

  // Delete Confirmation Modal
  deleteModal: document.getElementById('deleteModal'),
  deleteConfirmText: document.getElementById('deleteConfirmText'),
  closeDeleteModalBtn: document.getElementById('closeDeleteModalBtn'),
  cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),

  // Toast Region
  toastRegion: document.getElementById('toastRegion'),
};

/**
 * Loads fresh state from the REST API persistence layer.
 */
async function syncStateFromStorage() {
  try {
    state.backendError = null;
    state.transactions = await storage.getTransactions();
    state.budget = await storage.getBudget(state.activeMonth);
  } catch (err) {
    console.error('Failed to sync state from backend:', err);
    state.backendError = err.message || 'Unable to connect to the ClearLedger backend.';
  }
}

/**
 * Refreshes Lucide SVG icons inside newly rendered DOM fragments.
 */
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/**
 * Displays a transient toast notification.
 * @param {string} message
 * @param {'success'|'error'} variant
 */
function showToast(message, variant = 'success') {
  if (!els.toastRegion) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${variant}`;
  const iconName = variant === 'error' ? 'alert-circle' : 'check-circle-2';
  toast.innerHTML = `<i data-lucide="${iconName}"></i><span>${escapeHtml(message)}</span>`;
  els.toastRegion.appendChild(toast);
  refreshIcons();

  window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

/**
 * Mobile Sidebar Drawer Controls
 */
function setSidebarOpen(open) {
  els.sidebar?.classList.toggle('open', open);
  els.sidebarBackdrop?.classList.toggle('open', open);
  els.openSidebarBtn?.setAttribute('aria-expanded', String(open));
}

/**
 * Renders a visual loading indicator inside the main content container.
 */
function renderLoadingState() {
  if (!els.mainContent) return;
  els.mainContent.innerHTML = `
    <div class="empty-state" style="padding: 60px 20px;">
      <div class="empty-icon"><i data-lucide="loader-2"></i></div>
      <h3 class="empty-title">Loading financial records...</h3>
      <p class="empty-desc">Fetching transactions and budget details from the backend.</p>
    </div>
  `;
  refreshIcons();
}

/**
 * Navigates to a view and renders it.
 * @param {'dashboard'|'transactions'|'analytics'|'budget'} viewName
 */
function navigateTo(viewName) {
  if (!VIEW_META[viewName]) return;
  state.activeView = viewName;
  state.focusSearch = false;

  // Update sidebar active state
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    const isActive = btn.dataset.view === viewName;
    btn.classList.toggle('active', isActive);
    if (isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });

  // Update header titles
  const meta = VIEW_META[viewName];
  if (els.pageTitle) els.pageTitle.textContent = meta.title;
  if (els.pageSubtitle) els.pageSubtitle.textContent = meta.subtitle;

  setSidebarOpen(false);
  renderActiveView();
}

/**
 * Renders the currently active view module.
 */
function renderActiveView() {
  if (!els.mainContent) return;

  if (state.activeView !== 'dashboard') destroyDashboardCharts();
  if (state.activeView !== 'analytics') destroyAnalyticsCharts();

  // If backend error occurred, render error banner
  if (state.backendError) {
    els.mainContent.innerHTML = `
      <div class="notice-banner notice-danger" role="alert" style="margin-bottom: 24px;">
        <div class="notice-banner-content">
          <i data-lucide="alert-octagon"></i>
          <span><strong>Backend Error:</strong> ${escapeHtml(
            state.backendError
          )}. Please verify the backend server is running on port 3000.</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="retryBackendBtn">Retry</button>
      </div>
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="server-off"></i></div>
        <h3 class="empty-title">Cannot connect to server</h3>
        <p class="empty-desc">Make sure your Node.js server is started using <code>npm start</code>.</p>
      </div>
    `;
    const retryBtn = els.mainContent.querySelector('#retryBackendBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        renderLoadingState();
        await syncStateFromStorage();
        renderActiveView();
      });
    }
    refreshIcons();
    return;
  }

  const commonHandlers = {
    onNavigate: navigateTo,
    onOpenAddModal: () => openTransactionModal(),
    onEditTransaction: (id) => {
      // Find transaction matching ID (supports string or number)
      const txn = state.transactions.find((t) => String(t.id) === String(id));
      if (txn) openTransactionModal(txn);
    },
    onDeleteTransaction: (id) => openDeleteModal(id),
  };

  if (state.activeView === 'dashboard') {
    renderDashboardView(els.mainContent, state, commonHandlers);
  } else if (state.activeView === 'transactions') {
    renderTransactionsView(els.mainContent, state, {
      ...commonHandlers,
      onFilterChange: (patch) => {
        state.focusSearch = Object.prototype.hasOwnProperty.call(patch, 'search');
        state.filters = { ...state.filters, ...patch };
        renderActiveView();
      },
    });
  } else if (state.activeView === 'analytics') {
    renderAnalyticsView(els.mainContent, state, {
      onTimeframeChange: (timeframe) => {
        state.analyticsTimeframe = timeframe;
        renderActiveView();
      },
    });
  } else if (state.activeView === 'budget') {
    renderBudgetView(els.mainContent, state, {
      onSaveMonthlyBudget: async (limit) => {
        try {
          await storage.saveBudget({ monthlyLimit: limit }, state.activeMonth);
          await syncStateFromStorage();
          renderActiveView();
          showToast('Monthly budget updated.');
        } catch (err) {
          showToast(err.message || 'Failed to update budget', 'error');
        }
      },
      onSaveCategoryLimits: async (categoryLimits) => {
        try {
          await storage.saveBudget({ categoryLimits }, state.activeMonth);
          await syncStateFromStorage();
          renderActiveView();
          showToast('Category targets saved.');
        } catch (err) {
          showToast(err.message || 'Failed to save category targets', 'error');
        }
      },
    });
  } else if (state.activeView === 'insights') {
    renderInsightsView(els.mainContent, state, commonHandlers);
  }

  refreshIcons();
}

/**
 * Populates the Category <select> inside the Add/Edit modal based on transaction type.
 * @param {'expense'|'income'} type
 * @param {string} selectedCategory
 */
function populateCategorySelect(type, selectedCategory = '') {
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  els.txnCategory.innerHTML = list
    .map(
      (cat) =>
        `<option value="${escapeHtml(cat)}" ${
          cat === selectedCategory ? 'selected' : ''
        }>${escapeHtml(cat)}</option>`
    )
    .join('');

  if (!selectedCategory || !list.includes(selectedCategory)) {
    els.txnCategory.value = list[0];
  }
}

/**
 * Switches transaction type segmented control inside the modal.
 * @param {'expense'|'income'} type
 * @param {string} preferredCategory
 */
function setModalTransactionType(type, preferredCategory = '') {
  const normalized = type === 'income' ? 'income' : 'expense';
  els.txnType.value = normalized;
  els.typeExpenseBtn.classList.toggle('active', normalized === 'expense');
  els.typeIncomeBtn.classList.toggle('active', normalized === 'income');
  populateCategorySelect(normalized, preferredCategory);
}

/**
 * Clears inline validation errors inside the Transaction modal.
 */
function clearFormErrors() {
  [els.txnTitle, els.txnAmount, els.txnCategory, els.txnDate, els.txnDescription].forEach((el) =>
    el?.classList.remove('is-invalid')
  );
  [els.errTitle, els.errAmount, els.errCategory, els.errDate, els.errDescription].forEach((el) => {
    if (el) el.textContent = '';
  });
}

/**
 * Opens the Add or Edit Transaction modal.
 * @param {Object|null} existingTxn
 */
function openTransactionModal(existingTxn = null) {
  clearFormErrors();

  if (existingTxn) {
    els.transactionModalTitle.textContent = 'Edit Transaction';
    els.saveTransactionBtn.textContent = 'Update Transaction';
    els.txnId.value = existingTxn.id;
    setModalTransactionType(existingTxn.type, existingTxn.category);
    els.txnTitle.value = existingTxn.title;
    els.txnAmount.value = Number(existingTxn.amount).toFixed(2);
    els.txnDate.value = existingTxn.date;
    els.txnDescription.value = existingTxn.description || '';
  } else {
    els.transactionModalTitle.textContent = 'Add Transaction';
    els.saveTransactionBtn.textContent = 'Save Transaction';
    els.txnId.value = '';
    setModalTransactionType('expense');
    els.txnTitle.value = '';
    els.txnAmount.value = '';
    els.txnDate.value = getTodayIsoDate();
    els.txnDescription.value = '';
  }

  els.transactionModal.hidden = false;
  refreshIcons();
  els.txnTitle.focus();
}

function closeTransactionModal() {
  els.transactionModal.hidden = true;
}

/**
 * Opens the Delete confirmation modal for a given transaction ID.
 * @param {string|number} id
 */
function openDeleteModal(id) {
  const txn = state.transactions.find((t) => String(t.id) === String(id));
  if (!txn) return;
  state.pendingDeleteId = id;
  els.deleteConfirmText.textContent = `Are you sure you want to delete "${txn.title}"? This action cannot be undone.`;
  els.deleteModal.hidden = false;
  refreshIcons();
}

function closeDeleteModal() {
  state.pendingDeleteId = null;
  els.deleteModal.hidden = true;
}

/**
 * Handles form submission for adding or updating a transaction.
 */
async function handleTransactionSubmit(e) {
  e.preventDefault();
  clearFormErrors();

  const rawInput = {
    type: els.txnType.value,
    title: els.txnTitle.value,
    amount: els.txnAmount.value,
    category: els.txnCategory.value,
    date: els.txnDate.value,
    description: els.txnDescription.value,
  };

  const { valid, errors, normalized } = validateTransactionInput(rawInput);

  if (!valid) {
    if (errors.title) {
      els.txnTitle.classList.add('is-invalid');
      els.errTitle.textContent = errors.title;
    }
    if (errors.amount) {
      els.txnAmount.classList.add('is-invalid');
      els.errAmount.textContent = errors.amount;
    }
    if (errors.category) {
      els.txnCategory.classList.add('is-invalid');
      els.errCategory.textContent = errors.category;
    }
    if (errors.date) {
      els.txnDate.classList.add('is-invalid');
      els.errDate.textContent = errors.date;
    }
    if (errors.description) {
      els.txnDescription.classList.add('is-invalid');
      els.errDescription.textContent = errors.description;
    }
    return;
  }

  const editingId = els.txnId.value;
  try {
    if (editingId) {
      await storage.updateTransaction(editingId, normalized);
      showToast('Transaction updated.');
    } else {
      await storage.addTransaction(normalized);
      showToast(`${normalized.type === 'income' ? 'Income' : 'Expense'} added.`);
    }

    // Keep activeMonth aligned if user logs an entry in a new month
    state.activeMonth = normalized.date.slice(0, 7);
    if (els.globalMonthSelect) {
      els.globalMonthSelect.value = state.activeMonth;
    }

    closeTransactionModal();
    await syncStateFromStorage();
    renderActiveView();
  } catch (err) {
    showToast(err.message || 'Failed to save transaction', 'error');
  }
}

/**
 * Binds global DOM listeners and initializes the application.
 */
async function initApp() {
  renderLoadingState();

  try {
    const migration = await storage.migrateFromLocalStorageIfPresent();
    if (!migration.alreadyMigrated && (migration.importedTransactionsCount > 0 || migration.importedBudgetsCount > 0)) {
      showToast(`Migrated ${migration.importedTransactionsCount} records to database.`);
    }
    await storage.seedInitialDataIfEmpty(state.activeMonth);
    await syncStateFromStorage();
  } catch (err) {
    state.backendError = err.message || 'Cannot connect to backend server.';
  }

  if (els.globalMonthSelect) {
    els.globalMonthSelect.value = state.activeMonth;
    els.globalMonthSelect.addEventListener('change', async (e) => {
      if (e.target.value) {
        state.activeMonth = e.target.value;
        await syncStateFromStorage();
        renderActiveView();
      }
    });
  }

  // Sidebar navigation
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  els.brandHomeLink?.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('dashboard');
  });

  // Mobile drawer
  els.openSidebarBtn?.addEventListener('click', () => setSidebarOpen(true));
  els.closeSidebarBtn?.addEventListener('click', () => setSidebarOpen(false));
  els.sidebarBackdrop?.addEventListener('click', () => setSidebarOpen(false));

  // Data utilities
  els.exportCsvBtn?.addEventListener('click', () => {
    if (state.transactions.length === 0) {
      showToast('No transactions available to export.', 'error');
      return;
    }
    exportTransactionsCsv(state.transactions);
    showToast('Exported transactions to CSV.');
  });

  els.resetSampleBtn?.addEventListener('click', async () => {
    renderLoadingState();
    try {
      await storage.resetToSampleData(state.activeMonth);
      await syncStateFromStorage();
      state.activeMonth = getTodayIsoDate().slice(0, 7);
      if (els.globalMonthSelect) els.globalMonthSelect.value = state.activeMonth;
      renderActiveView();
      showToast('Demo data restored.');
    } catch (err) {
      showToast(err.message || 'Failed to reset demo data', 'error');
      renderActiveView();
    }
  });

  // Add/Edit Modal listeners
  els.openAddModalBtn?.addEventListener('click', () => openTransactionModal());
  els.closeTransactionModalBtn?.addEventListener('click', closeTransactionModal);
  els.cancelTransactionBtn?.addEventListener('click', closeTransactionModal);
  els.transactionModal?.addEventListener('click', (e) => {
    if (e.target === els.transactionModal) closeTransactionModal();
  });

  els.typeExpenseBtn?.addEventListener('click', () => setModalTransactionType('expense'));
  els.typeIncomeBtn?.addEventListener('click', () => setModalTransactionType('income'));
  els.transactionForm?.addEventListener('submit', handleTransactionSubmit);

  // Delete Modal listeners
  els.closeDeleteModalBtn?.addEventListener('click', closeDeleteModal);
  els.cancelDeleteBtn?.addEventListener('click', closeDeleteModal);
  els.deleteModal?.addEventListener('click', (e) => {
    if (e.target === els.deleteModal) closeDeleteModal();
  });
  els.confirmDeleteBtn?.addEventListener('click', async () => {
    if (state.pendingDeleteId) {
      try {
        await storage.deleteTransaction(state.pendingDeleteId);
        closeDeleteModal();
        await syncStateFromStorage();
        renderActiveView();
        showToast('Transaction deleted.');
      } catch (err) {
        showToast(err.message || 'Failed to delete transaction', 'error');
      }
    }
  });

  // Escape key closes open modals or mobile drawer
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.transactionModal.hidden) closeTransactionModal();
      else if (!els.deleteModal.hidden) closeDeleteModal();
      else setSidebarOpen(false);
    }
  });

  navigateTo('dashboard');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
