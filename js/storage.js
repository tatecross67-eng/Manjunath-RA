/**
 * storage.js — Centralized REST API Persistence Layer
 * ---------------------------------------------------------------------------
 * Replaces LocalStorage with asynchronous fetch() calls to the Node.js/Express
 * REST API endpoints (/api/transactions and /api/budgets).
 * Includes one-time migration from LocalStorage to SQLite.
 */

// Smart API base: uses relative '/api' when served from the Express server on port 3000,
// and falls back to 'http://localhost:3000/api' if opened from Vite (5173), Live Server (5500), or file://
const API_BASE =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '3000'))
    ? 'http://localhost:3000/api'
    : '/api';

const MIGRATION_KEY = 'clearledger_migrated_to_db_v1';
const LEGACY_STORAGE_KEYS = {
  TRANSACTIONS: 'clearledger_transactions_v1',
  BUDGET: 'clearledger_budget_v1',
};

/**
 * Helper to perform API fetch requests and parse JSON responses.
 * @param {string} endpoint
 * @param {RequestInit} [options]
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = body?.error || `Request failed with status ${response.status}`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body?.data;
}

/**
 * Retrieves all transactions from the backend (ordered newest first).
 * API: GET /api/transactions
 * @returns {Promise<Array<Object>>}
 */
export async function getTransactions() {
  const data = await apiRequest('/transactions');
  return Array.isArray(data) ? data : [];
}

/**
 * Creates and stores a new transaction record via the backend.
 * API: POST /api/transactions
 * @param {Object} payload
 * @returns {Promise<Object>} Created transaction
 */
export async function addTransaction(payload) {
  const cleanPayload = {
    title: String(payload.title || '').trim(),
    amount: Number(Number(payload.amount).toFixed(2)),
    category: String(payload.category || 'Other'),
    type: payload.type === 'income' ? 'income' : 'expense',
    date: String(payload.date || ''),
    description: String(payload.description || '').trim(),
  };

  return await apiRequest('/transactions', {
    method: 'POST',
    body: JSON.stringify(cleanPayload),
  });
}

/**
 * Updates an existing transaction by ID via the backend.
 * API: PUT /api/transactions/:id
 * @param {number|string} id
 * @param {Object} updates
 * @returns {Promise<Object>} Updated transaction
 */
export async function updateTransaction(id, updates) {
  const numericId = Number(id);
  const cleanPayload = {
    title: updates.title !== undefined ? String(updates.title).trim() : undefined,
    amount: updates.amount !== undefined ? Number(Number(updates.amount).toFixed(2)) : undefined,
    category: updates.category !== undefined ? String(updates.category) : undefined,
    type: updates.type === 'income' || updates.type === 'expense' ? updates.type : undefined,
    date: updates.date !== undefined ? String(updates.date) : undefined,
    description: updates.description !== undefined ? String(updates.description).trim() : undefined,
  };

  return await apiRequest(`/transactions/${numericId}`, {
    method: 'PUT',
    body: JSON.stringify(cleanPayload),
  });
}

/**
 * Deletes a transaction by ID via the backend.
 * API: DELETE /api/transactions/:id
 * @param {number|string} id
 * @returns {Promise<boolean>} True if removed
 */
export async function deleteTransaction(id) {
  const numericId = Number(id);
  await apiRequest(`/transactions/${numericId}`, {
    method: 'DELETE',
  });
  return true;
}

/**
 * Retrieves budget settings for a target month (YYYY-MM).
 * API: GET /api/budgets/:year/:month
 * @param {string} [targetMonth] YYYY-MM
 * @returns {Promise<{ monthlyLimit: number, categoryLimits: Object<string, number>, updatedAt: string|null, id: number|null }>}
 */
export async function getBudget(targetMonth) {
  const defaultBudget = {
    monthlyLimit: 0,
    categoryLimits: {},
    updatedAt: null,
    id: null,
  };

  const monthKey = targetMonth || new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!year || !month) return defaultBudget;

  try {
    const data = await apiRequest(`/budgets/${year}/${month}`);
    if (!data) return defaultBudget;

    return {
      monthlyLimit: Number(data.amount) || 0,
      categoryLimits: data.categoryLimits && typeof data.categoryLimits === 'object' ? data.categoryLimits : {},
      updatedAt: data.createdAt || null,
      id: data.id || null,
    };
  } catch (err) {
    if (err.status === 404) {
      return defaultBudget;
    }
    throw err;
  }
}

/**
 * Persists budget configuration for a target month via the backend.
 * API: POST /api/budgets or PUT /api/budgets/:id
 * @param {Object} budgetData
 * @param {string} [targetMonth] YYYY-MM
 * @returns {Promise<{ monthlyLimit: number, categoryLimits: Object<string, number>, updatedAt: string|null, id: number|null }>}
 */
export async function saveBudget(budgetData, targetMonth) {
  const monthKey = targetMonth || new Date().toISOString().slice(0, 7);
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  const existing = await getBudget(monthKey);

  const newLimit =
    budgetData.monthlyLimit !== undefined
      ? Math.max(0, Number(Number(budgetData.monthlyLimit).toFixed(2)))
      : existing.monthlyLimit;

  const newCatLimits =
    budgetData.categoryLimits !== undefined ? budgetData.categoryLimits : existing.categoryLimits;

  if (existing.id) {
    // Update existing budget record
    const updated = await apiRequest(`/budgets/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        amount: newLimit,
        categoryLimits: newCatLimits,
      }),
    });

    return {
      monthlyLimit: Number(updated.amount) || 0,
      categoryLimits: updated.categoryLimits || {},
      updatedAt: updated.createdAt,
      id: updated.id,
    };
  } else {
    // Create new budget record
    try {
      const created = await apiRequest('/budgets', {
        method: 'POST',
        body: JSON.stringify({
          year,
          month,
          amount: newLimit > 0 ? newLimit : 1, // Fallback if setting categories before overall limit
          categoryLimits: newCatLimits,
        }),
      });

      return {
        monthlyLimit: Number(created.amount) || 0,
        categoryLimits: created.categoryLimits || {},
        updatedAt: created.createdAt,
        id: created.id,
      };
    } catch (err) {
      if (err.status === 409) {
        const latest = await getBudget(monthKey);
        if (latest.id) {
          const updated = await apiRequest(`/budgets/${latest.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              amount: newLimit,
              categoryLimits: newCatLimits,
            }),
          });
          return {
            monthlyLimit: Number(updated.amount) || 0,
            categoryLimits: updated.categoryLimits || {},
            updatedAt: updated.createdAt,
            id: updated.id,
          };
        }
      }
      throw err;
    }
  }
}

/**
 * One-time migration: imports transactions & budgets from LocalStorage into the SQLite database.
 * Does NOT delete the original LocalStorage data (preserves it as backup).
 * Sets a flag so migration runs only once.
 * @returns {Promise<{ importedTransactionsCount: number, importedBudgetsCount: number, alreadyMigrated: boolean }>}
 */
export async function migrateFromLocalStorageIfPresent() {
  const alreadyMigrated = window.localStorage.getItem(MIGRATION_KEY);
  if (alreadyMigrated === 'true') {
    return { importedTransactionsCount: 0, importedBudgetsCount: 0, alreadyMigrated: true };
  }

  let importedTransactionsCount = 0;
  let importedBudgetsCount = 0;

  try {
    // Read legacy transactions from LocalStorage
    const rawTxns = window.localStorage.getItem(LEGACY_STORAGE_KEYS.TRANSACTIONS);
    if (rawTxns) {
      const parsedTxns = JSON.parse(rawTxns);
      if (Array.isArray(parsedTxns) && parsedTxns.length > 0) {
        for (const t of parsedTxns) {
          if (t && t.title && t.amount && t.category && t.type && t.date) {
            try {
              await addTransaction({
                title: t.title,
                amount: t.amount,
                category: t.category,
                type: t.type,
                date: t.date,
                description: t.description || '',
              });
              importedTransactionsCount += 1;
            } catch (postErr) {
              console.warn('Failed to import transaction record during migration:', t, postErr);
            }
          }
        }
      }
    }

    // Read legacy budget from LocalStorage
    const rawBudget = window.localStorage.getItem(LEGACY_STORAGE_KEYS.BUDGET);
    if (rawBudget) {
      const parsedBudget = JSON.parse(rawBudget);
      const monthlyLimit = Number(parsedBudget?.monthlyLimit) || 0;
      if (monthlyLimit > 0) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        try {
          await apiRequest('/budgets', {
            method: 'POST',
            body: JSON.stringify({
              year,
              month,
              amount: monthlyLimit,
              categoryLimits: parsedBudget.categoryLimits || {},
            }),
          });
          importedBudgetsCount += 1;
        } catch (budgetErr) {
          // If already exists, ignore
          console.warn('Budget record notice during migration:', budgetErr);
        }
      }
    }

    // Set migration flag to ensure this runs only once
    window.localStorage.setItem(MIGRATION_KEY, 'true');
    console.log(
      `[ClearLedger Migration] Completed. Imported ${importedTransactionsCount} transactions and ${importedBudgetsCount} budget records.`
    );
  } catch (err) {
    console.error('[ClearLedger Migration] Error during migration:', err);
  }

  return {
    importedTransactionsCount,
    importedBudgetsCount,
    alreadyMigrated: false,
  };
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
    { title: 'Monthly Product Salary', amount: 5400.0, category: 'Salary', type: 'income', date: `${m0}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Lease', amount: 1450.0, category: 'Housing', type: 'expense', date: `${m0}-02`, description: 'Monthly apartment rent and building fee' },
    { title: 'Grocery Shopping', amount: 285.4, category: 'Food', type: 'expense', date: `${m0}-04`, description: 'Weekly groceries and fresh produce' },
    { title: 'UI Design Advisory', amount: 850.0, category: 'Freelance', type: 'income', date: `${m0}-06`, description: 'Design system review retainer' },
    { title: 'Electric & Fiber Internet', amount: 164.5, category: 'Utilities', type: 'expense', date: `${m0}-07`, description: 'Monthly utility and broadband bill' },
    { title: 'Metro Pass & Rideshare', amount: 118.0, category: 'Transport', type: 'expense', date: `${m0}-09`, description: 'Monthly transit pass and airport trip' },
    { title: 'Dental Checkup', amount: 145.0, category: 'Healthcare', type: 'expense', date: `${m0}-10`, description: 'Routine cleaning co-pay' },
    { title: 'Whole Foods Market', amount: 176.25, category: 'Food', type: 'expense', date: `${m0}-12`, description: 'Pantry staples and coffee beans' },
    { title: 'Monthly Product Salary', amount: 5400.0, category: 'Salary', type: 'income', date: `${m1}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Lease', amount: 1450.0, category: 'Housing', type: 'expense', date: `${m1}-02`, description: 'Monthly apartment rent' },
    { title: 'Groceries & Dining', amount: 462.8, category: 'Food', type: 'expense', date: `${m1}-11`, description: 'Monthly supermarket and team lunch' },
    { title: 'Autumn Jacket & Shoes', amount: 215.0, category: 'Shopping', type: 'expense', date: `${m1}-18`, description: 'Seasonal wardrobe essentials' },
    { title: 'Concert & Streaming', amount: 94.0, category: 'Entertainment', type: 'expense', date: `${m1}-22`, description: 'Live jazz tickets and subscriptions' },
    { title: 'Monthly Product Salary', amount: 5200.0, category: 'Salary', type: 'income', date: `${m2}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Lease', amount: 1450.0, category: 'Housing', type: 'expense', date: `${m2}-02`, description: 'Monthly apartment rent' },
    { title: 'Online Course Subscription', amount: 199.0, category: 'Education', type: 'expense', date: `${m2}-14`, description: 'Annual technical workshop access' },
    { title: 'Quarterly Dividend Payout', amount: 340.0, category: 'Investments', type: 'income', date: `${m2}-20`, description: 'Index fund quarterly distribution' },
    { title: 'Monthly Product Salary', amount: 5200.0, category: 'Salary', type: 'income', date: `${m3}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Lease', amount: 1450.0, category: 'Housing', type: 'expense', date: `${m3}-02`, description: 'Monthly apartment rent' },
    { title: 'Groceries & Utilities', amount: 580.0, category: 'Food', type: 'expense', date: `${m3}-15`, description: 'Household food and utilities' },
    { title: 'Monthly Product Salary', amount: 5200.0, category: 'Salary', type: 'income', date: `${m4}-01`, description: 'Primary payroll direct deposit' },
    { title: 'Apartment Lease', amount: 1450.0, category: 'Housing', type: 'expense', date: `${m4}-02`, description: 'Monthly apartment rent' },
  ];
}

/**
 * Seeds initial sample data into the backend database if the database is currently empty.
 * @param {string} [activeMonth]
 */
export async function seedInitialDataIfEmpty(activeMonth) {
  const currentList = await getTransactions();
  if (currentList.length > 0) return;

  const samples = buildSampleTransactions();
  for (const s of samples) {
    await addTransaction(s);
  }

  const monthKey = activeMonth || new Date().toISOString().slice(0, 7);
  await saveBudget(
    {
      monthlyLimit: 2800,
      categoryLimits: {
        Housing: 1500,
        Food: 500,
        Utilities: 200,
        Transport: 180,
        Healthcare: 200,
      },
    },
    monthKey
  );
}

/**
 * Resets database back to clean sample demo data through the API.
 * @param {string} [activeMonth]
 */
export async function resetToSampleData(activeMonth) {
  const currentList = await getTransactions();
  for (const item of currentList) {
    await deleteTransaction(item.id);
  }

  const samples = buildSampleTransactions();
  for (const s of samples) {
    await addTransaction(s);
  }

  const monthKey = activeMonth || new Date().toISOString().slice(0, 7);
  await saveBudget(
    {
      monthlyLimit: 2800,
      categoryLimits: {
        Housing: 1500,
        Food: 500,
        Utilities: 200,
        Transport: 180,
        Healthcare: 200,
      },
    },
    monthKey
  );
}
