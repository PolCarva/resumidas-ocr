import type { SupportedCurrency } from '@/lib/ocr-free-adapter'

export interface ExpenseTransactionLike {
  id: string
  date: string
  description: string
  amount: number
  type?: string
  category: string
  currency?: SupportedCurrency
  accountNumber?: string
  analysisText?: string
}

export interface CurrencyMovementLike {
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit' | 'balance'
  currency: SupportedCurrency
  accountNumber?: string
}

export interface CurrencyMovementsBucketLike {
  currency: SupportedCurrency
  rawCurrencies: string[]
  accountNumbers: string[]
  debits: CurrencyMovementLike[]
  credits: CurrencyMovementLike[]
  balances: CurrencyMovementLike[]
}

export interface CombinedMovement {
  id: string
  transactionId?: string
  date: string
  description: string
  amount: number
  category: string
  entryType: 'expense' | 'income'
  currency: SupportedCurrency
  editable: boolean
  deletable: boolean
  accountNumber?: string
  analysisText?: string
}

export interface DailyFinancialPoint {
  dateKey: string
  day: string
  income: number
  expense: number
  net: number
}

export interface DailyBalancePoint {
  dateKey: string
  day: string
  balance: number
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function normalizeCurrency(currency?: SupportedCurrency): SupportedCurrency {
  return currency || 'UNKNOWN'
}

export function normalizeEntryType(type?: string, amount?: number): 'expense' | 'income' {
  const normalized = String(type || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (
    normalized.includes('income')
    || normalized.includes('ingreso')
    || normalized.includes('credito')
    || normalized.includes('credit')
    || normalized.includes('abono')
    || normalized.includes('deposit')
  ) {
    return 'income'
  }

  if (typeof amount === 'number' && amount < 0) {
    return 'income'
  }

  return 'expense'
}

export function parseDisplayDate(value?: string): Date | null {
  const raw = String(value || '').trim()
  if (!raw) {
    return null
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/').map(Number)
    const date = new Date(year, month - 1, day)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

export function toCanonicalDateKey(value?: string): string {
  const parsed = parseDisplayDate(value)
  if (!parsed) {
    return String(value || '')
  }

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
}

export function formatShortDay(value?: string): string {
  const parsed = parseDisplayDate(value)
  if (!parsed) {
    return String(value || '').slice(0, 5)
  }

  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}`
}

export function compareDisplayDates(dateA: string, dateB: string): number {
  return toCanonicalDateKey(dateA).localeCompare(toCanonicalDateKey(dateB))
}

export function toDateInputValue(displayDate?: string): string {
  return toCanonicalDateKey(displayDate)
}

export function buildCombinedMovements({
  transactions,
  movementsByCurrency,
  activeCurrency = null,
}: {
  transactions: ExpenseTransactionLike[]
  movementsByCurrency: CurrencyMovementsBucketLike[]
  activeCurrency?: SupportedCurrency | null
}): CombinedMovement[] {
  const filteredTransactions = activeCurrency
    ? transactions.filter((transaction) => normalizeCurrency(transaction.currency) === activeCurrency)
    : transactions

  const relevantBuckets = activeCurrency
    ? movementsByCurrency.filter((bucket) => bucket.currency === activeCurrency)
    : movementsByCurrency

  const expenseAndIncomeRows = filteredTransactions.map((transaction) => {
    const entryType = normalizeEntryType(transaction.type, transaction.amount)
    return {
      id: transaction.id,
      transactionId: transaction.id,
      date: transaction.date,
      description: transaction.description || 'Sin descripción',
      amount: Math.abs(transaction.amount),
      category: entryType === 'income' ? 'Ingresos' : transaction.category || 'Otros',
      entryType,
      currency: normalizeCurrency(transaction.currency),
      editable: entryType === 'expense',
      deletable: entryType === 'expense',
      accountNumber: transaction.accountNumber,
      analysisText: transaction.analysisText,
    } satisfies CombinedMovement
  })

  const creditRows = relevantBuckets.flatMap((bucket) =>
    bucket.credits.map((credit, index) => ({
      id: `income-${bucket.currency}-${credit.accountNumber || 'na'}-${credit.date}-${index}`,
      date: credit.date,
      description: credit.description || 'Sin descripción',
      amount: Math.abs(credit.amount),
      category: 'Ingresos',
      entryType: 'income' as const,
      currency: bucket.currency,
      editable: false,
      deletable: false,
      accountNumber: credit.accountNumber,
    })),
  )

  const deduped = new Map<string, CombinedMovement>()

  for (const item of [...expenseAndIncomeRows, ...creditRows]) {
    const signature = [
      item.entryType,
      item.currency,
      item.date,
      item.description,
      item.amount.toFixed(2),
      item.accountNumber || '',
    ].join('|')

    if (!deduped.has(signature)) {
      deduped.set(signature, item)
    }
  }

  return Array.from(deduped.values())
}

export function buildDailyFinancialSeries(movements: CombinedMovement[]): DailyFinancialPoint[] {
  const byDay = new Map<string, DailyFinancialPoint>()

  for (const movement of movements) {
    const dateKey = toCanonicalDateKey(movement.date)
    const current = byDay.get(dateKey) || {
      dateKey,
      day: formatShortDay(movement.date),
      income: 0,
      expense: 0,
      net: 0,
    }

    if (movement.entryType === 'income') {
      current.income += Math.abs(movement.amount)
    } else {
      current.expense += Math.abs(movement.amount)
    }

    current.net = current.income - current.expense
    byDay.set(dateKey, current)
  }

  return Array.from(byDay.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

export function buildDailyBalanceSeries({
  movementsByCurrency,
  activeCurrency,
}: {
  movementsByCurrency: CurrencyMovementsBucketLike[]
  activeCurrency?: SupportedCurrency | null
}): DailyBalancePoint[] {
  const relevantBuckets = activeCurrency
    ? movementsByCurrency.filter((bucket) => bucket.currency === activeCurrency)
    : movementsByCurrency

  const balanceRows = relevantBuckets.flatMap((bucket) =>
    bucket.balances.map((balance, index) => ({
      index,
      dateKey: toCanonicalDateKey(balance.date),
      day: formatShortDay(balance.date),
      balance: balance.amount,
    })),
  )

  balanceRows.sort((a, b) => {
    const dateComparison = a.dateKey.localeCompare(b.dateKey)
    if (dateComparison !== 0) {
      return dateComparison
    }

    return a.index - b.index
  })

  const latestBalancePerDay = new Map<string, DailyBalancePoint>()

  for (const row of balanceRows) {
    latestBalancePerDay.set(row.dateKey, {
      dateKey: row.dateKey,
      day: row.day,
      balance: row.balance,
    })
  }

  return Array.from(latestBalancePerDay.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}
