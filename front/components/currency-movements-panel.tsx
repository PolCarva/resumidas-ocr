"use client"

interface TransactionItem {
  id: string
  date: string
  description: string
  amount: number
  currency?: 'UYU' | 'USD' | 'UNKNOWN'
}

interface CurrencyMovementItem {
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit' | 'balance'
  currency: 'UYU' | 'USD' | 'UNKNOWN'
}

interface CurrencyMovementsData {
  currency: 'UYU' | 'USD' | 'UNKNOWN'
  rawCurrencies: string[]
  accountNumbers: string[]
  debits: CurrencyMovementItem[]
  credits: CurrencyMovementItem[]
  balances: CurrencyMovementItem[]
}

interface CurrencyMovementsPanelProps {
  activeCurrency: 'UYU' | 'USD' | 'UNKNOWN' | null
  transactions: TransactionItem[]
  movementsByCurrency: CurrencyMovementsData[]
}

function formatSignedAmount(amount: number, currency: 'UYU' | 'USD' | 'UNKNOWN'): string {
  const formatter = new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: currency === 'UNKNOWN' ? 'UYU' : currency,
    minimumFractionDigits: 2,
  })

  const prefix = amount > 0 ? '+' : amount < 0 ? '-' : ''
  return `${prefix}${formatter.format(Math.abs(amount))}`
}

function getCurrencyLabel(currency: 'UYU' | 'USD' | 'UNKNOWN' | null): string {
  if (currency === 'UYU') {
    return 'Pesos (UYU)'
  }

  if (currency === 'USD') {
    return 'Dólares (USD)'
  }

  return 'Moneda no identificada'
}

function MovementList({
  title,
  items,
  currency,
}: {
  title: string
  items: Array<{ date: string; description: string; amount: number }>
  currency: 'UYU' | 'USD' | 'UNKNOWN'
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Descripción</th>
              <th className="px-4 py-2 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-sm text-gray-500 text-center">
                  Sin datos
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={`${title}-${item.date}-${index}`} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">{item.date || '-'}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{item.description || 'Sin descripción'}</td>
                  <td className="px-4 py-2 text-sm font-semibold text-right whitespace-nowrap">
                    {formatSignedAmount(item.amount, currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function CurrencyMovementsPanel({
  activeCurrency,
  transactions,
  movementsByCurrency,
}: CurrencyMovementsPanelProps) {
  if (!activeCurrency) {
    return null
  }

  const bucket = movementsByCurrency.find((item) => item.currency === activeCurrency)
  const debitItems = transactions.map((transaction) => ({
    date: transaction.date,
    description: transaction.description,
    amount: -Math.abs(transaction.amount),
  }))

  const creditItems = (bucket?.credits || []).map((item) => ({
    date: item.date,
    description: item.description,
    amount: Math.abs(item.amount),
  }))

  const balanceItems = (bucket?.balances || []).map((item) => ({
    date: item.date,
    description: item.description,
    amount: item.amount,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-800">Movimientos por moneda</h2>
        <p className="text-sm text-gray-600">{getCurrencyLabel(activeCurrency)}</p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <MovementList title="Débitos" items={debitItems} currency={activeCurrency} />
        <MovementList title="Créditos" items={creditItems} currency={activeCurrency} />
        <MovementList title="Saldos" items={balanceItems} currency={activeCurrency} />
      </div>
    </div>
  )
}
