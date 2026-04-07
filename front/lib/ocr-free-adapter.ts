import { getCategoryColor } from '@/lib/constants'

export type SupportedCurrency = 'UYU' | 'USD' | 'UNKNOWN'

interface OcrFreeAccountInfo {
  client_no?: string
  currency?: string
  account_no?: string
}

interface OcrFreeTransactionRaw {
  id?: string
  fecha?: string
  concepto?: string
  referencia?: string
  debitos?: string
  creditos?: string
  saldos?: string
  category?: string
  source?: string
  analysis_text?: string
  original_text?: string
}

interface OcrFreePageRaw {
  page_number?: number
  account_info?: OcrFreeAccountInfo
  transactions?: OcrFreeTransactionRaw[]
}

export interface OcrFreeResult {
  md_results?: string
  structured_data?: OcrFreePageRaw[]
}

export interface OcrFreeSavedPayload {
  ocr_result?: OcrFreeResult | null
  categorized_result?: OcrFreeResult | null
}

export interface FrontTransaction {
  id: string
  date: string
  description: string
  amount: number
  type: 'expense'
  category: string
  currency: SupportedCurrency
  accountNumber?: string
  page?: number
  analysisText?: string
  source?: string
}

export interface FrontCategoryData {
  name: string
  value: number
  color: string
}

export interface FrontDailyData {
  day: string
  amount: number
}

export interface FrontCurrencyMovementItem {
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit' | 'balance'
  currency: SupportedCurrency
  accountNumber?: string
}

export interface FrontCurrencyMovementsData {
  currency: SupportedCurrency
  rawCurrencies: string[]
  accountNumbers: string[]
  debits: FrontCurrencyMovementItem[]
  credits: FrontCurrencyMovementItem[]
  balances: FrontCurrencyMovementItem[]
}

const MONTH_TO_NUMBER: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
}

const MONTH_TO_NAME: Record<string, string> = {
  JAN: 'Enero',
  FEB: 'Febrero',
  MAR: 'Marzo',
  APR: 'Abril',
  MAY: 'Mayo',
  JUN: 'Junio',
  JUL: 'Julio',
  AUG: 'Agosto',
  SEP: 'Setiembre',
  OCT: 'Octubre',
  NOV: 'Noviembre',
  DEC: 'Diciembre',
}

const BACK_ICON_TO_FRONT_ICON: Record<string, string> = {
  'bar-chart-3': 'BarChart',
  BarChart: 'BarChart',
  PieChart: 'PieChart',
  LineChart: 'LineChart',
  BarChart2: 'BarChart2',
  Activity: 'Activity',
  DollarSign: 'DollarSign',
  CreditCard: 'CreditCard',
}

function normalizeCurrency(raw?: string): SupportedCurrency {
  const value = String(raw || '').toUpperCase()
  if (value.includes('USD') || value.includes('US.D')) {
    return 'USD'
  }
  if (value.includes('UYU') || value.includes('URGP')) {
    return 'UYU'
  }
  return 'UNKNOWN'
}

function parseAmount(raw?: string): number {
  const value = String(raw || '').trim()
  if (!value) {
    return 0
  }

  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : 0
}

function buildLookupText(tx: OcrFreeTransactionRaw): string {
  const original = String(tx.original_text || '').trim()
  if (original) {
    return original
  }

  const analysis = String(tx.analysis_text || '').trim()
  if (analysis) {
    return analysis
  }

  return [tx.concepto, tx.referencia].filter(Boolean).join(' ').trim()
}

function toDisplayDate(rawDate?: string, statementToken?: string | null): string {
  const value = String(rawDate || '').trim()
  if (!value) {
    return ''
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    return value
  }

  const match = value.match(/^(\d{2})([A-Z]{3})$/)
  if (!match) {
    return value
  }

  const [, day, monthToken] = match
  const year = statementToken?.slice(-4) || String(new Date().getFullYear())
  const month = MONTH_TO_NUMBER[monthToken] || '01'
  return `${day}/${month}/${year}`
}

export function guessStatementDateToken(ocrResult?: OcrFreeResult | null): string | null {
  const markdown = String(ocrResult?.md_results || '')
  const match = markdown.match(/\b\d{2}[A-Z]{3}\d{4}\b/)
  return match ? match[0] : null
}

export function guessTitleFromOcrResult(ocrResult?: OcrFreeResult | null): string {
  const token = guessStatementDateToken(ocrResult)
  if (!token) {
    return 'Resumen'
  }

  const monthToken = token.slice(2, 5)
  const year = token.slice(-4)
  return `Resumen de ${MONTH_TO_NAME[monthToken] || monthToken} ${year}`
}

export function normalizeFrontIcon(icon?: string): string {
  const value = String(icon || '').trim()
  return BACK_ICON_TO_FRONT_ICON[value] || 'BarChart'
}

export function mapOcrFreeHistoryItem(item: {
  id: string | number
  title?: string
  statement_date?: string | null
  source?: string | null
  created_at?: string
  icon?: string
  color?: string
}) {
  const sourceLabel =
    item.statement_date?.trim() ||
    (item.source && item.source !== 'ocr_free_v1' ? item.source : 'Análisis OCR Free')

  return {
    id: String(item.id),
    fileName: item.title || 'Resumen',
    originalFileName: sourceLabel,
    createdAt: item.created_at || new Date().toISOString(),
    icon: normalizeFrontIcon(item.icon),
    color: item.color || 'blue',
  }
}

export function buildAnalysisFromOcrFreePayload({
  analysisId,
  payload,
  title,
}: {
  analysisId: string | number
  payload: OcrFreeSavedPayload
  title?: string | null
}) {
  const ocrResult = payload.ocr_result || null
  const categorizedResult = payload.categorized_result || null
  const pages =
    categorizedResult?.structured_data && categorizedResult.structured_data.length > 0
      ? categorizedResult.structured_data
      : ocrResult?.structured_data || []

  const statementToken =
    guessStatementDateToken(ocrResult) || guessStatementDateToken(categorizedResult)

  const movementBuckets = new Map<SupportedCurrency, FrontCurrencyMovementsData>()
  const transactions: FrontTransaction[] = []

  const getBucket = (
    currency: SupportedCurrency,
    rawCurrency?: string,
    accountNumber?: string,
  ) => {
    const existing = movementBuckets.get(currency)
    if (existing) {
      const rawValue = String(rawCurrency || '').trim()
      if (rawValue && !existing.rawCurrencies.includes(rawValue)) {
        existing.rawCurrencies.push(rawValue)
      }
      if (accountNumber && !existing.accountNumbers.includes(accountNumber)) {
        existing.accountNumbers.push(accountNumber)
      }
      return existing
    }

    const bucket: FrontCurrencyMovementsData = {
      currency,
      rawCurrencies: rawCurrency ? [rawCurrency] : [],
      accountNumbers: accountNumber ? [accountNumber] : [],
      debits: [],
      credits: [],
      balances: [],
    }
    movementBuckets.set(currency, bucket)
    return bucket
  }

  pages.forEach((page, pageIndex) => {
    const currency = normalizeCurrency(page.account_info?.currency)
    const accountNumber = String(page.account_info?.account_no || '').trim() || undefined
    const bucket = getBucket(currency, page.account_info?.currency, accountNumber)

    ;(page.transactions || []).forEach((tx, txIndex) => {
      const id =
        String(tx.id || '').trim() ||
        `tx-${analysisId}-${page.page_number || pageIndex + 1}-${txIndex + 1}`
      const date = toDisplayDate(tx.fecha, statementToken)
      const description =
        String(tx.referencia || tx.concepto || tx.original_text || '').trim() || 'Sin descripción'
      const category = String(tx.category || '').trim() || 'Otros'
      const analysisText = buildLookupText(tx)
      const debit = parseAmount(tx.debitos)
      const credit = parseAmount(tx.creditos)
      const balance = parseAmount(tx.saldos)

      if (debit > 0) {
        const debitItem: FrontTransaction = {
          id,
          date,
          description,
          amount: debit,
          type: 'expense',
          category,
          currency,
          accountNumber,
          page: page.page_number || pageIndex + 1,
          analysisText,
          source: tx.source,
        }
        transactions.push(debitItem)
        bucket.debits.push({
          date,
          description,
          amount: debit,
          type: 'debit',
          currency,
          accountNumber,
        })
      }

      if (credit > 0) {
        bucket.credits.push({
          date,
          description,
          amount: credit,
          type: 'credit',
          currency,
          accountNumber,
        })
      }

      if (String(tx.saldos || '').trim()) {
        bucket.balances.push({
          date,
          description,
          amount: balance,
          type: 'balance',
          currency,
          accountNumber,
        })
      }
    })
  })

  const categoryTotals = transactions.reduce<Record<string, number>>((acc, transaction) => {
    acc[transaction.category] = (acc[transaction.category] || 0) + Math.abs(transaction.amount)
    return acc
  }, {})

  const categoryData: FrontCategoryData[] = Object.entries(categoryTotals)
    .map(([name, value]) => ({
      name,
      value,
      color: getCategoryColor(name),
    }))
    .sort((a, b) => b.value - a.value)

  const dailyTotals = transactions.reduce<Record<string, number>>((acc, transaction) => {
    const dayKey = transaction.date.substring(0, 5)
    acc[dayKey] = (acc[dayKey] || 0) + Math.abs(transaction.amount)
    return acc
  }, {})

  const dailyData: FrontDailyData[] = Object.entries(dailyTotals)
    .map(([day, amount]) => ({ day, amount }))
    .sort((a, b) => {
      const [dayA, monthA] = a.day.split('/').map(Number)
      const [dayB, monthB] = b.day.split('/').map(Number)
      return monthA === monthB ? dayA - dayB : monthA - monthB
    })

  return {
    id: String(analysisId),
    fileName: title || guessTitleFromOcrResult(ocrResult),
    transactions,
    categoryData,
    dailyData,
    movementsByCurrency: Array.from(movementBuckets.values()),
    payload,
  }
}
