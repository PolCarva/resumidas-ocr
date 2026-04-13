"use client"

import { useCallback, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts"
import { motion } from "framer-motion"
import { useExpenseStore } from "@/store/expenses"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2 } from "lucide-react"
import { getCategoryColor } from "@/lib/constants"
import {
  buildCombinedMovements,
  buildDailyBalanceSeries,
  buildDailyFinancialSeries,
  compareDisplayDates,
} from "@/lib/expense-insights"

interface ExpenseSummaryProps {
  activeCurrency?: 'UYU' | 'USD' | 'UNKNOWN' | null
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{
    value?: unknown
    name?: string | number
    dataKey?: string | number
    color?: string
  }>
  label?: string
  formatMoney: (value: number) => string
  nameMap?: Record<string, string>
}

function ChartTooltip({ active, payload, label, formatMoney, nameMap = {} }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null
  }

  return (
    <div className="min-w-[180px] rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-[0_18px_45px_-24px_rgba(15,23,42,0.5)] backdrop-blur">
      {label ? (
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
          {label}
        </p>
      ) : null}
      <div className="mt-2 space-y-2">
        {payload.map((item, index) => {
          const rawValue = Array.isArray(item.value) ? Number(item.value[0] || 0) : Number(item.value || 0)
          const itemKey = String(item.dataKey || item.name || `value-${index}`)
          const itemName = String(item.name || "")
          const itemLabel = nameMap[itemKey] || nameMap[itemName] || itemName || itemKey || "Valor"

          return (
            <div key={`${itemKey}-${index}`} className="flex items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color || "#0f172a" }}
                />
                <span>{itemLabel}</span>
              </div>
              <span className="font-semibold text-slate-950">{formatMoney(rawValue)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
  caption,
}: {
  label: string
  value: string
  tone: 'emerald' | 'rose' | 'sky' | 'amber'
  caption: string
}) {
  const toneStyles = {
    emerald: "border-emerald-100 bg-white/85 text-emerald-700",
    rose: "border-rose-100 bg-white/85 text-rose-700",
    sky: "border-sky-100 bg-white/85 text-sky-700",
    amber: "border-amber-100 bg-white/85 text-amber-700",
  }

  return (
    <div className={`rounded-[1.4rem] border p-4 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur ${toneStyles[tone]}`}>
      <p className="text-[0.68rem] uppercase tracking-[0.24em]">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{caption}</p>
    </div>
  )
}

export function ExpenseSummary({ activeCurrency = null }: ExpenseSummaryProps) {
  const transactions = useExpenseStore((state) => state.transactions)
  const movementsByCurrency = useExpenseStore((state) => state.movementsByCurrency)
  const isUpdating = useExpenseStore((state) => state.isUpdating)
  const [activeTab, setActiveTab] = useState("categories")

  const formatMoney = useCallback((value: number) =>
    new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: activeCurrency === 'USD' ? 'USD' : 'UYU',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value), [activeCurrency])

  const combinedMovements = useMemo(() => buildCombinedMovements({
    transactions,
    movementsByCurrency,
    activeCurrency,
  }), [transactions, movementsByCurrency, activeCurrency])

  const sortedMovements = useMemo(() =>
    [...combinedMovements].sort((a, b) => compareDisplayDates(a.date, b.date)),
  [combinedMovements])

  const expenseMovements = useMemo(() =>
    combinedMovements.filter((movement) => movement.entryType === 'expense'),
  [combinedMovements])

  const categoryData = useMemo(() => {
    const categoryTotals = expenseMovements.reduce((acc, movement) => {
      const category = movement.category || 'Otros'
      if (!acc[category]) {
        acc[category] = {
          name: category,
          value: 0,
          color: getCategoryColor(category),
        }
      }

      acc[category].value += Math.abs(movement.amount)
      return acc
    }, {} as Record<string, { name: string; value: number; color: string }>)

    return Object.values(categoryTotals).sort((a, b) => b.value - a.value)
  }, [expenseMovements])

  const dailyComparisonData = useMemo(() =>
    buildDailyFinancialSeries(combinedMovements),
  [combinedMovements])

  const dailyBalanceData = useMemo(() =>
    buildDailyBalanceSeries({
      movementsByCurrency,
      activeCurrency,
    }),
  [movementsByCurrency, activeCurrency])

  const totals = useMemo(() => {
    return combinedMovements.reduce((acc, movement) => {
      if (movement.entryType === 'income') {
        acc.income += Math.abs(movement.amount)
      } else {
        acc.expense += Math.abs(movement.amount)
      }

      return acc
    }, { income: 0, expense: 0 })
  }, [combinedMovements])

  const netResult = totals.income - totals.expense
  const isProfit = netResult >= 0
  const topCategory = categoryData[0] || null
  const latestBalance = dailyBalanceData[dailyBalanceData.length - 1]?.balance ?? null

  const periodTitle = useMemo(() => {
    const firstMovement = sortedMovements[0]
    if (!firstMovement?.date) {
      return "Resumen financiero"
    }

    try {
      const [day, month, year] = firstMovement.date.split('/')
      if (!day || !month || !year) {
        return "Resumen financiero"
      }

      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
      ]

      return `Resumen financiero · ${monthNames[Number(month) - 1]} ${year}`
    } catch {
      return "Resumen financiero"
    }
  }, [sortedMovements])

  const pieChartComponent = useMemo(() => {
    if (categoryData.length === 0) {
      return null
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Pie
            data={categoryData}
            cx="50%"
            cy="50%"
            outerRadius={132}
            innerRadius={84}
            paddingAngle={2}
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={6}
            dataKey="value"
            isAnimationActive={false}
          >
            {categoryData.map((entry, index) => (
              <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={(props) => (
              <ChartTooltip
                {...props}
                formatMoney={formatMoney}
                nameMap={{ value: "Gasto" }}
              />
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    )
  }, [categoryData, formatMoney])

  const balanceChartComponent = useMemo(() => {
    if (dailyBalanceData.length === 0) {
      return null
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dailyBalanceData} margin={{ top: 12, right: 20, left: 4, bottom: 8 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f766e" stopOpacity={0.32} />
              <stop offset="55%" stopColor="#14b8a6" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#ecfeff" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#cbd5e1" />
          <XAxis
            dataKey="day"
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={84}
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatMoney(Number(value))}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                {...props}
                formatMoney={formatMoney}
                nameMap={{ balance: "Saldo" }}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#0f766e"
            strokeWidth={3}
            fill="url(#balanceFill)"
            dot={false}
            activeDot={{ r: 5, fill: "#0f766e", stroke: "#ffffff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    )
  }, [dailyBalanceData, formatMoney])

  const comparisonChartComponent = useMemo(() => {
    if (dailyComparisonData.length === 0) {
      return null
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dailyComparisonData} barGap={10} margin={{ top: 12, right: 20, left: 4, bottom: 8 }}>
          <defs>
            <linearGradient id="incomeBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
            <linearGradient id="expenseBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e11d48" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#cbd5e1" />
          <XAxis
            dataKey="day"
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            width={84}
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatMoney(Number(value))}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                {...props}
                formatMoney={formatMoney}
                nameMap={{ income: "Ingresos", expense: "Gastos" }}
              />
            )}
          />
          <Bar
            dataKey="income"
            fill="url(#incomeBar)"
            radius={[12, 12, 4, 4]}
            maxBarSize={28}
            isAnimationActive={false}
          />
          <Bar
            dataKey="expense"
            fill="url(#expenseBar)"
            radius={[12, 12, 4, 4]}
            maxBarSize={28}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    )
  }, [dailyComparisonData, formatMoney])

  if (isUpdating) {
    return (
      <div className="flex h-96 flex-col items-center justify-center space-y-4 rounded-[2rem] border border-slate-200 bg-white/80">
        <Loader2 className="h-12 w-12 animate-spin text-emerald-600" />
        <p className="text-lg text-slate-600">Actualizando datos...</p>
      </div>
    )
  }

  if (combinedMovements.length === 0) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No hay datos disponibles</AlertTitle>
          <AlertDescription>
            No se encontraron movimientos para mostrar en el resumen. Añade nuevas transacciones o importa datos para comenzar.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_rgba(240,253,250,0.92)_38%,_rgba(248,250,252,0.96)_75%)] p-6 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)]">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-32 w-32 rounded-full bg-sky-200/25 blur-3xl" />

        <div className="relative">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-white/90 bg-white/85 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                  {activeCurrency || 'Moneda detectada'}
                </span>
                <span className="rounded-full border border-emerald-100 bg-emerald-50/90 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-emerald-700 shadow-sm">
                  {combinedMovements.length} movimientos
                </span>
                {latestBalance !== null ? (
                  <span className="rounded-full border border-sky-100 bg-sky-50/90 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-sky-700 shadow-sm">
                    Último saldo {formatMoney(latestBalance)}
                  </span>
                ) : null}
              </div>

              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
                {periodTitle}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Una lectura más clara del período: cuánto entró, cuánto salió, cómo evolucionó el saldo y en qué categorías se concentró el gasto.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[620px] xl:grid-cols-4">
              <StatCard
                label="Ingresos"
                value={formatMoney(totals.income)}
                tone="emerald"
                caption="Entradas acumuladas del período."
              />
              <StatCard
                label="Gastos"
                value={formatMoney(totals.expense)}
                tone="rose"
                caption="Salidas registradas y categorizadas."
              />
              <StatCard
                label="Resultado"
                value={isProfit ? formatMoney(netResult) : `-${formatMoney(Math.abs(netResult))}`}
                tone={isProfit ? "sky" : "amber"}
                caption={isProfit ? "El período cerró arriba." : "El gasto superó al ingreso."}
              />
              <StatCard
                label="Mayor categoría"
                value={topCategory?.name || "Sin datos"}
                tone="sky"
                caption={topCategory && totals.expense > 0
                  ? `${((topCategory.value / totals.expense) * 100).toFixed(0)}% del gasto total.`
                  : "Todavía no hay gasto suficiente para rankear."}
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8 w-full">
            <TabsList className="grid w-full max-w-3xl grid-cols-3 rounded-[1.35rem] border border-white/80 bg-white/70 p-1 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.45)] backdrop-blur">
              <TabsTrigger
                value="categories"
                className={`rounded-[1rem] px-4 py-2.5 transition-all ${activeTab === "categories" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}
              >
                Categorías
              </TabsTrigger>
              <TabsTrigger
                value="balance"
                className={`rounded-[1rem] px-4 py-2.5 transition-all ${activeTab === "balance" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}
              >
                Saldo diario
              </TabsTrigger>
              <TabsTrigger
                value="comparison"
                className={`rounded-[1rem] px-4 py-2.5 transition-all ${activeTab === "comparison" ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}
              >
                Ingreso vs gasto
              </TabsTrigger>
            </TabsList>

            <TabsContent value="categories" className="mt-6">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="grid gap-6 lg:grid-cols-[1.6fr_1fr]"
              >
                <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.5)]">
                  <div className="absolute -right-12 top-0 h-32 w-32 rounded-full bg-emerald-100/60 blur-3xl" />
                  <div className="relative">
                    <h3 className="text-lg font-semibold text-slate-950">Distribución de gastos</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      La dona prioriza lectura rápida: centro limpio, colores por categoría y detalle fino en el panel lateral.
                    </p>
                    <div className="relative mt-6 h-80">
                      {categoryData.length > 0 ? pieChartComponent : (
                        <div className="flex h-full items-center justify-center">
                          <p className="text-slate-500">No hay gastos categorizados para mostrar.</p>
                        </div>
                      )}
                      {categoryData.length > 0 ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="rounded-full border border-white/90 bg-white/88 px-6 py-5 text-center shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] backdrop-blur">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
                              Total gasto
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-slate-950">{formatMoney(totals.expense)}</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.5)]">
                  <div className="absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-sky-100/60 blur-3xl" />
                  <div className="relative flex h-full flex-col">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">Peso por categoría</h3>
                        <p className="mt-1 text-sm text-slate-500">Cuánto aporta cada rubro al total gastado.</p>
                      </div>
                    </div>

                    {categoryData.length > 0 ? (
                      <div className="mt-6 flex-1 overflow-hidden">
                        <div className="h-full max-h-[26rem] space-y-3 overflow-y-auto pr-1">
                        {categoryData.map((category) => {
                          const share = totals.expense > 0 ? (category.value / totals.expense) * 100 : 0

                          return (
                            <div key={category.name} className="rounded-[1.1rem] border border-slate-100 bg-white/80 px-4 py-3">
                              <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-3">
                                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                                    <span className="truncate text-sm font-medium text-slate-800">{category.name}</span>
                                  </div>
                                  <p className="mt-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">
                                    {share.toFixed(0)}% del gasto
                                  </p>
                                </div>
                                <span className="text-sm font-semibold text-slate-950">{formatMoney(category.value)}</span>
                              </div>
                              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(share, 4)}%`,
                                    background: `linear-gradient(90deg, ${category.color}, ${category.color}BB)`,
                                  }}
                                />
                              </div>
                            </div>
                          )
                        })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-48 items-center justify-center">
                        <p className="text-slate-500">No hay gastos para resumir.</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </TabsContent>

            <TabsContent value="balance" className="mt-6">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/92 p-6 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.5)]">
                  <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-emerald-100/50 blur-3xl" />
                  <div className="relative">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">Saldo disponible por día</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Seguimos el último saldo informado de cada fecha para ver la respiración real de la cuenta.
                        </p>
                      </div>
                      {latestBalance !== null ? (
                        <div className="rounded-[1.2rem] border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-800 shadow-sm">
                          Último registro: <span className="font-semibold">{formatMoney(latestBalance)}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-6 h-96">
                      {dailyBalanceData.length > 0 ? balanceChartComponent : (
                        <div className="flex h-full items-center justify-center">
                          <p className="text-slate-500">No hay saldos diarios para mostrar en esta moneda.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </TabsContent>

            <TabsContent value="comparison" className="mt-6">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
                <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/92 p-6 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.5)]">
                  <div className="absolute left-0 top-0 h-32 w-32 rounded-full bg-rose-100/45 blur-3xl" />
                  <div className="relative">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">Comparativa ingreso vs gasto</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Verde para entradas, rojo para salidas. El contraste permite detectar los días donde la caja se tensó.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-medium">
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-emerald-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          Ingresos
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-1.5 text-rose-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                          Gastos
                        </span>
                      </div>
                    </div>
                    <div className="mt-6 h-96">
                      {dailyComparisonData.length > 0 ? comparisonChartComponent : (
                        <div className="flex h-full items-center justify-center">
                          <p className="text-slate-500">No hay suficientes movimientos para comparar.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`rounded-[1.75rem] border p-6 shadow-[0_26px_60px_-42px_rgba(15,23,42,0.5)] ${isProfit ? 'border-emerald-100 bg-emerald-50/80' : 'border-amber-100 bg-amber-50/85'}`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className={`text-sm font-semibold uppercase tracking-[0.18em] ${isProfit ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {isProfit ? 'Período en profit' : 'Período en pérdida'}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {isProfit
                          ? `Terminaste el período con ${formatMoney(netResult)} a favor.`
                          : `Terminaste el período gastando ${formatMoney(Math.abs(netResult))} más de lo que ingresó.`}
                      </p>
                    </div>
                    <div className="rounded-[1.2rem] bg-white/90 px-4 py-3 shadow-sm">
                      <p className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Neto</p>
                      <p className={`mt-2 text-2xl font-semibold ${isProfit ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {isProfit ? formatMoney(netResult) : `-${formatMoney(Math.abs(netResult))}`}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
