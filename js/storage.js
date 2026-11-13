/**
 * storage.js — Centralized Data Persistence Layer
 * ---------------------------------------------------------------------------
 * Encapsulates all LocalStorage read/write operations for ClearLedger.
 * Designed using a clean repository interface so LocalStorage calls can be
 * replaced with Node.js / Express / SQL REST API endpoints (fetch) without
 * modifying any UI or calculation modules.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'clearledger_transactions_v1',
  BUDGET: 'clearledger_budget_v1',
  INITIALIZED: 'clearledger_initialized_v1',
};

/**
 * Generates a unique transaction identifier.
 * @returns {string}
 */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `txn_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Safely parses JSON from LocalStorage.
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (err) {
    console.error(`Failed to parse storage key "${key}":`, err);
    return fallback;
  }
}

/**
 * Safely serializes JSON into LocalStorage.
 * @param {string} key
 * @param {unknown} value
 */
function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to persist storage key "${key}":`, err);
  }
}

/**
 * Retrieves all stored transactions.
 * Future API replacement: GET /api/transactions
 * @returns {Array<Object>}
 */
export function getTransactions() {
  const list = readJson(STORAGE_KEYS.TRANSACTIONS, []);
  return Array.isArray(list) ? list : [];
}

/**
 * Persists the complete transactions collection.
 * @param {Array<Object>} transactions
 * @returns {Array<Object>}
 */
export function saveTransactions(transactions) {
  const sanitized = Array.isArray(transactions) ? transactions : [];
  writeJson(STORAGE_KEYS.TRANSACTIONS, sanitized);
  return sanitized;
}

/**
 * Creates and stores a new transaction record.
 * Future API replacement: POST /api/transactions
 * @param {Object} payload
 * @returns {Object} Created transaction
 */
export function addTransaction(payload) {
  const transactions = getTransactions();
  const newRecord = {
    id: generateId(),
    title: String(payload.title || '').trim(),
    amount: Number(Number(payload.amount).toFixed(2)),
    category: String(payload.category || 'Other'),
    type: payload.type === 'income' ? 'income' : 'expense',
    date: String(payload.date || ''),
    description: String(payload.description || '').trim(),
  };

  transactions.push(newRecord);
  saveTransactions(transactions);
  return newRecord;
}

/**
 * Updates an existing transaction by ID.
 * Future API replacement: PUT /api/transactions/:id
 * @param {string} id
 * @param {Object} updates
 * @returns {Object|null} Updated transaction or null if not found
 */
export function updateTransaction(id, updates) {
  const transactions = getTransactions();
  const index = transactions.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const current = transactions[index];
  const updated = {
    ...current,
    title: updates.title !== undefined ? String(updates.title).trim() : current.title,
    amount: updates.amount !== undefined ? Number(Number(updates.amount).toFixed(2)) : current.amount,
    category: updates.category !== undefined ? String(updates.category) : current.category,
    type: updates.type === 'income' || updates.type === 'expense' ? updates.type : current.type,
    date: updates.date !== undefined ? String(updates.date) : current.date,
    description:
      updates.description !== undefined ? String(updates.description).trim() : current.description,
  };

  transactions[index] = updated;
  saveTransactions(transactions);
  return updated;
}

/**
 * Deletes a transaction by ID.
 * Future API replacement: DELETE /api/transactions/:id
 * @param {string} id
 * @returns {boolean} True if removed
 */
export function deleteTransaction(id) {
  const transactions = getTransactions();
  const next = transactions.filter((item) => item.id !== id);
  if (next.length === transactions.length) return false;
  saveTransactions(next);
  return true;
}

/**
 * Retrieves budget settings.
 * Future API replacement: GET /api/budget
 * @returns {{ monthlyLimit: number, categoryLimits: Object<string, number>, updatedAt: string|null }}
 */
export function getBudget() {
  const defaultBudget = {
    monthlyLimit: 0,
    categoryLimits: {},
    updatedAt: null,
  };
  const stored = readJson(STORAGE_KEYS.BUDGET, defaultBudget);
  return {
    monthlyLimit: Number(stored.monthlyLimit) || 0,
    categoryLimits:
      stored.categoryLimits && typeof stored.categoryLimits === 'object'
        ? stored.categoryLimits
        : {},
    updatedAt: stored.updatedAt || null,
  };
}

/**
 * Persists budget configuration.
 * Future API replacement: PUT /api/budget
 * @param {Object} budgetData
 * @returns {{ monthlyLimit: number, categoryLimits: Object<string, number>, updatedAt: string }}
 */
export function saveBudget(budgetData) {
  const current = getBudget();
  const next = {
    monthlyLimit:
      budgetData.monthlyLimit !== undefined
        ? Math.max(0, Number(Number(budgetData.monthlyLimit).toFixed(2)))
        : current.monthlyLimit,
    categoryLimits:
      budgetData.categoryLimits !== undefined
        ? budgetData.categoryLimits
        : current.categoryLimits,
    updatedAt: new Date().toISOString(),
  };
  writeJson(STORAGE_KEYS.BUDGET, next);
  return next;
}

/**
 * Builds realistic multi-month sample transactions anchored to the current date.
 * @returns {Array<Object>}
 */
function buildSampleTransactions() {
  const now = new Date();
  const toIsoMonth = (offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };

  const m0 = toIsoMonth(0);
  const m1 = toIsoMonth(-1);
  const m2 = toIsoMonth(-2);
  const m3 = toIsoMonth(-3);
  const m4 = toIsoMonth(-4);

  return [
    {
      id: generateId(),
      title: 'Monthly Product Salary',
      amount: 5400.0,
      category: 'Salary',
      type: 'income',
      date: `${m0}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Lease',
      amount: 1450.0,
      category: 'Housing',
      type: 'expense',
      date: `${m0}-02`,
      description: 'Monthly apartment rent and building fee',
    },
    {
      id: generateId(),
      title: 'Grocery Shopping',
      amount: 285.4,
      category: 'Food',
      type: 'expense',
      date: `${m0}-04`,
      description: 'Weekly groceries and fresh produce',
    },
    {
      id: generateId(),
      title: 'UI Design Advisory',
      amount: 850.0,
      category: 'Freelance',
      type: 'income',
      date: `${m0}-06`,
      description: 'Design system review retainer',
    },
    {
      id: generateId(),
      title: 'Electric & Fiber Internet',
      amount: 164.5,
      category: 'Utilities',
      type: 'expense',
      date: `${m0}-07`,
      description: 'Monthly utility and broadband bill',
    },
    {
      id: generateId(),
      title: 'Metro Pass & Rideshare',
      amount: 118.0,
      category: 'Transport',
      type: 'expense',
      date: `${m0}-09`,
      description: 'Monthly transit pass and airport trip',
    },
    {
      id: generateId(),
      title: 'Dental Checkup',
      amount: 145.0,
      category: 'Healthcare',
      type: 'expense',
      date: `${m0}-10`,
      description: 'Routine cleaning co-pay',
    },
    {
      id: generateId(),
      title: 'Whole Foods Market',
      amount: 176.25,
      category: 'Food',
      type: 'expense',
      date: `${m0}-12`,
      description: 'Pantry staples and coffee beans',
    },
    {
      id: generateId(),
      title: 'Monthly Product Salary',
      amount: 5400.0,
      category: 'Salary',
      type: 'income',
      date: `${m1}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Lease',
      amount: 1450.0,
      category: 'Housing',
      type: 'expense',
      date: `${m1}-02`,
      description: 'Monthly apartment rent',
    },
    {
      id: generateId(),
      title: 'Groceries & Dining',
      amount: 462.8,
      category: 'Food',
      type: 'expense',
      date: `${m1}-11`,
      description: 'Monthly supermarket and team lunch',
    },
    {
      id: generateId(),
      title: 'Autumn Jacket & Shoes',
      amount: 215.0,
      category: 'Shopping',
      type: 'expense',
      date: `${m1}-18`,
      description: 'Seasonal wardrobe essentials',
    },
    {
      id: generateId(),
      title: 'Concert & Streaming',
      amount: 94.0,
      category: 'Entertainment',
      type: 'expense',
      date: `${m1}-22`,
      description: 'Live jazz tickets and subscriptions',
    },
    {
      id: generateId(),
      title: 'Monthly Product Salary',
      amount: 5200.0,
      category: 'Salary',
      type: 'income',
      date: `${m2}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Lease',
      amount: 1450.0,
      category: 'Housing',
      type: 'expense',
      date: `${m2}-02`,
      description: 'Monthly apartment rent',
    },
    {
      id: generateId(),
      title: 'Online Course Subscription',
      amount: 199.0,
      category: 'Education',
      type: 'expense',
      date: `${m2}-14`,
      description: 'Annual technical workshop access',
    },
    {
      id: generateId(),
      title: 'Quarterly Dividend Payout',
      amount: 340.0,
      category: 'Investments',
      type: 'income',
      date: `${m2}-20`,
      description: 'Index fund quarterly distribution',
    },
    {
      id: generateId(),
      title: 'Monthly Product Salary',
      amount: 5200.0,
      category: 'Salary',
      type: 'income',
      date: `${m3}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Lease',
      amount: 1450.0,
      category: 'Housing',
      type: 'expense',
      date: `${m3}-02`,
      description: 'Monthly apartment rent',
    },
    {
      id: generateId(),
      title: 'Groceries & Utilities',
      amount: 580.0,
      category: 'Food',
      type: 'expense',
      date: `${m3}-15`,
      description: 'Household food and utilities',
    },
    {
      id: generateId(),
      title: 'Monthly Product Salary',
      amount: 5200.0,
      category: 'Salary',
      type: 'income',
      date: `${m4}-01`,
      description: 'Primary payroll direct deposit',
    },
    {
      id: generateId(),
      title: 'Apartment Lease',
      amount: 1450.0,
      category: 'Housing',
      type: 'expense',
      date: `${m4}-02`,
      description: 'Monthly apartment rent',
    },
  ];
}

/**
 * Seeds initial sample data only once on a fresh browser profile.
 * Existing user data is never overwritten.
 */
export function seedInitialDataIfEmpty() {
  const alreadyInit = window.localStorage.getItem(STORAGE_KEYS.INITIALIZED);
  if (alreadyInit === 'true') return;

  saveTransactions(buildSampleTransactions());
  saveBudget({
    monthlyLimit: 2800,
    categoryLimits: {
      Housing: 1500,
      Food: 500,
      Utilities: 200,
      Transport: 180,
      Healthcare: 200,
    },
  });
  window.localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}

/**
 * Resets storage back to clean sample demo data.
 */
export function resetToSampleData() {
  saveTransactions(buildSampleTransactions());
  saveBudget({
    monthlyLimit: 2800,
    categoryLimits: {
      Housing: 1500,
      Food: 500,
      Utilities: 200,
      Transport: 180,
      Healthcare: 200,
    },
  });
  window.localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}

/**
 * Clears all stored transactions and budget data.
 */
export function clearAllData() {
  saveTransactions([]);
  saveBudget({ monthlyLimit: 0, categoryLimits: {} });
  window.localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
}
