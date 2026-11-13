/**
 * app.js — Application Shell, Routing, Modals & State Orchestrator
 * ---------------------------------------------------------------------------
 * Coordinates navigation across Dashboard, Transactions, Analytics, and Budget,
 * handles Add/Edit/Delete transaction modals with validation, and keeps UI synced
 * with the centralized storage module.
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
  budget: { monthlyLimit: 0, categoryLimits: {}, updatedAt: null },
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
 * Loads fresh state from the centralized storage module.
 */
function syncStateFromStorage() {
  state.transactions = storage.getTransactions();
  state.budget = storage.getBudget();
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

  const commonHandlers = {
    onNavigate: navigateTo,
    onOpenAddModal: () => openTransactionModal(),
    onEditTransaction: (id) => {
      const txn = state.transactions.find((t) => t.id === id);
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
      onSaveMonthlyBudget: (limit) => {
        storage.saveBudget({ monthlyLimit: limit });
        syncStateFromStorage();
        renderActiveView();
        showToast('Monthly budget updated.');
      },
      onSaveCategoryLimits: (categoryLimits) => {
        storage.saveBudget({ categoryLimits });
        syncStateFromStorage();
        renderActiveView();
        showToast('Category targets saved.');
      },
    });
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
 * @param {string} id
 */
function openDeleteModal(id) {
  const txn = state.transactions.find((t) => t.id === id);
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
function handleTransactionSubmit(e) {
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
  if (editingId) {
    storage.updateTransaction(editingId, normalized);
    showToast('Transaction updated.');
  } else {
    storage.addTransaction(normalized);
    showToast(`${normalized.type === 'income' ? 'Income' : 'Expense'} added.`);
  }

  // Keep activeMonth aligned if user logs an entry in a new month
  state.activeMonth = normalized.date.slice(0, 7);
  if (els.globalMonthSelect) {
    els.globalMonthSelect.value = state.activeMonth;
  }

  closeTransactionModal();
  syncStateFromStorage();
  renderActiveView();
}

/**
 * Binds global DOM listeners and initializes the application.
 */
function initApp() {
  storage.seedInitialDataIfEmpty();
  syncStateFromStorage();

  if (els.globalMonthSelect) {
    els.globalMonthSelect.value = state.activeMonth;
    els.globalMonthSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        state.activeMonth = e.target.value;
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

  els.resetSampleBtn?.addEventListener('click', () => {
    storage.resetToSampleData();
    syncStateFromStorage();
    state.activeMonth = getTodayIsoDate().slice(0, 7);
    if (els.globalMonthSelect) els.globalMonthSelect.value = state.activeMonth;
    renderActiveView();
    showToast('Demo data restored.');
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
  els.confirmDeleteBtn?.addEventListener('click', () => {
    if (state.pendingDeleteId) {
      storage.deleteTransaction(state.pendingDeleteId);
      closeDeleteModal();
      syncStateFromStorage();
      renderActiveView();
      showToast('Transaction deleted.');
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
