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
  LineChart,
  Line,
  CartesianGrid,
  Legend,
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

      return `Resumen financiero - ${monthNames[Number(month) - 1]} ${year}`
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
        <PieChart>
          <Pie
            data={categoryData}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={120}
            innerRadius={60}
            fill="#1d4ed8"
            dataKey="value"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            paddingAngle={2}
            isAnimationActive={false}
          >
            {categoryData.map((entry, index) => (
              <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [formatMoney(value), "Gasto"]}
            contentStyle={{
              borderRadius: "12px",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
              border: "none",
            }}
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
        <LineChart data={dailyBalanceData} margin={{ top: 12, right: 24, left: 8, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="day"
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatMoney(Number(value))}
          />
          <Tooltip
            formatter={(value: number) => [formatMoney(value), "Saldo"]}
            contentStyle={{
              borderRadius: "12px",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
              border: "none",
            }}
          />
          <Line
            type="monotone"
            dataKey="balance"
            name="Saldo"
            stroke="#0f766e"
            strokeWidth={3}
            dot={{ r: 4, fill: "#0f766e" }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    )
  }, [dailyBalanceData, formatMoney])

  const comparisonChartComponent = useMemo(() => {
    if (dailyComparisonData.length === 0) {
      return null
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dailyComparisonData} margin={{ top: 12, right: 24, left: 8, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="day"
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => formatMoney(Number(value))}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatMoney(value),
              name === 'income' ? 'Ingresos' : 'Gastos',
            ]}
            contentStyle={{
              borderRadius: "12px",
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
              border: "none",
            }}
          />
          <Legend
            formatter={(value) => value === 'income' ? 'Ingresos' : 'Gastos'}
          />
          <Bar
            dataKey="income"
            name="income"
            fill="#16a34a"
            radius={[6, 6, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="expense"
            name="expense"
            fill="#dc2626"
            radius={[6, 6, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    )
  }, [dailyComparisonData, formatMoney])

  if (isUpdating) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <p className="text-lg text-gray-600">Actualizando datos...</p>
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
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{periodTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Seguimiento diario de ingresos, gastos y saldo para entender si el período cerró con profit o en pérdida.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[560px]">
            <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-600">Ingresos</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-700">{formatMoney(totals.income)}</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-white/90 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-rose-600">Gastos</p>
              <p className="mt-2 text-2xl font-semibold text-rose-700">{formatMoney(totals.expense)}</p>
            </div>
            <div className={`rounded-2xl border bg-white/90 p-4 shadow-sm ${isProfit ? 'border-sky-100' : 'border-amber-100'}`}>
              <p className={`text-xs uppercase tracking-[0.18em] ${isProfit ? 'text-sky-600' : 'text-amber-600'}`}>
                Resultado
              </p>
              <p className={`mt-2 text-2xl font-semibold ${isProfit ? 'text-sky-700' : 'text-amber-700'}`}>
                {formatMoney(Math.abs(netResult))}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {isProfit ? 'Profit: ingresó más de lo que se gastó.' : 'Pérdida: se gastó más de lo que ingresó.'}
              </p>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8 w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3 rounded-2xl bg-slate-100 p-1">
            <TabsTrigger
              value="categories"
              className={`rounded-xl transition-all ${activeTab === "categories" ? "bg-white shadow-sm" : "hover:bg-slate-200"}`}
            >
              Categorías
            </TabsTrigger>
            <TabsTrigger
              value="balance"
              className={`rounded-xl transition-all ${activeTab === "balance" ? "bg-white shadow-sm" : "hover:bg-slate-200"}`}
            >
              Saldo Diario
            </TabsTrigger>
            <TabsTrigger
              value="comparison"
              className={`rounded-xl transition-all ${activeTab === "comparison" ? "bg-white shadow-sm" : "hover:bg-slate-200"}`}
            >
              Ingreso vs Gasto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="mt-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35 }}
              className="grid gap-6 lg:grid-cols-[1.7fr_1fr]"
            >
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Distribución de gastos</h3>
                <p className="mt-1 text-sm text-slate-500">Los ingresos quedan integrados en la tabla y la comparativa; aquí seguimos viendo en qué se fue el gasto.</p>
                <div className="mt-6 h-80">
                  {categoryData.length > 0 ? pieChartComponent : (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-slate-500">No hay gastos categorizados para mostrar.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Resumen por categoría</h3>
                {categoryData.length > 0 ? (
                  <div className="mt-6 space-y-4">
                    {categoryData.map((category) => (
                      <div key={category.name} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                          <span className="text-sm font-medium text-slate-700">{category.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{formatMoney(category.value)}</span>
                      </div>
                    ))}
                    <div className="border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between font-semibold text-slate-900">
                        <span>Total gasto</span>
                        <span>{formatMoney(totals.expense)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-48 items-center justify-center">
                    <p className="text-slate-500">No hay gastos para resumir.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="balance" className="mt-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Saldo disponible por día</h3>
                <p className="mt-1 text-sm text-slate-500">Tomamos el último saldo registrado de cada día para ver la evolución real.</p>
                <div className="mt-6 h-96">
                  {dailyBalanceData.length > 0 ? balanceChartComponent : (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-slate-500">No hay saldos diarios para mostrar en esta moneda.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="comparison" className="mt-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Comparativa ingreso vs gasto</h3>
                <p className="mt-1 text-sm text-slate-500">Si la barra roja supera a la verde, ese día se gastó más de lo que entró.</p>
                <div className="mt-6 h-96">
                  {dailyComparisonData.length > 0 ? comparisonChartComponent : (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-slate-500">No hay suficientes movimientos para comparar.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className={`rounded-3xl border p-6 shadow-sm ${isProfit ? 'border-emerald-100 bg-emerald-50/70' : 'border-amber-100 bg-amber-50/80'}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className={`text-sm font-semibold ${isProfit ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {isProfit ? 'Período en profit' : 'Período en pérdida'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {isProfit
                        ? `Terminaste el período con ${formatMoney(netResult)} a favor.`
                        : `Terminaste el período gastando ${formatMoney(Math.abs(netResult))} más de lo que ingresó.`}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Neto</p>
                    <p className={`mt-1 text-xl font-semibold ${isProfit ? 'text-emerald-700' : 'text-amber-700'}`}>
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
  )
}
