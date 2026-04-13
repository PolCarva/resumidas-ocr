const EXPENSE_CACHE_KEYS = {
  transactions: 'lastViewedTransactions',
  categoryData: 'lastViewedCategoryData',
  dailyData: 'lastViewedDailyData',
  movementsByCurrency: 'lastViewedMovementsByCurrency',
  analysisId: 'lastViewedAnalysisId',
  userId: 'lastViewedUserId',
} as const

interface ExpenseSnapshotPayload {
  transactions: unknown[]
  categoryData: unknown[]
  dailyData: unknown[]
  movementsByCurrency?: unknown[]
  userId: string
  analysisId?: string | null
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

export function clearStoredExpenseSnapshot() {
  const storage = getStorage()
  if (!storage) {
    return
  }

  Object.values(EXPENSE_CACHE_KEYS).forEach((key) => {
    storage.removeItem(key)
  })
}

export function readStoredExpenseSnapshot() {
  const storage = getStorage()
  if (!storage) {
    return null
  }

  return {
    transactions: storage.getItem(EXPENSE_CACHE_KEYS.transactions),
    categoryData: storage.getItem(EXPENSE_CACHE_KEYS.categoryData),
    dailyData: storage.getItem(EXPENSE_CACHE_KEYS.dailyData),
    movementsByCurrency: storage.getItem(EXPENSE_CACHE_KEYS.movementsByCurrency),
    analysisId: storage.getItem(EXPENSE_CACHE_KEYS.analysisId),
    userId: storage.getItem(EXPENSE_CACHE_KEYS.userId),
  }
}

export function readStoredExpenseUserId() {
  const storage = getStorage()
  if (!storage) {
    return null
  }

  return storage.getItem(EXPENSE_CACHE_KEYS.userId)
}

export function saveStoredExpenseSnapshot({
  transactions,
  categoryData,
  dailyData,
  movementsByCurrency = [],
  userId,
  analysisId,
}: ExpenseSnapshotPayload) {
  const storage = getStorage()
  if (!storage) {
    return
  }

  storage.setItem(EXPENSE_CACHE_KEYS.transactions, JSON.stringify(transactions))
  storage.setItem(EXPENSE_CACHE_KEYS.categoryData, JSON.stringify(categoryData))
  storage.setItem(EXPENSE_CACHE_KEYS.dailyData, JSON.stringify(dailyData))
  storage.setItem(EXPENSE_CACHE_KEYS.movementsByCurrency, JSON.stringify(movementsByCurrency))
  storage.setItem(EXPENSE_CACHE_KEYS.userId, userId)

  if (analysisId) {
    storage.setItem(EXPENSE_CACHE_KEYS.analysisId, analysisId)
    return
  }

  storage.removeItem(EXPENSE_CACHE_KEYS.analysisId)
}
