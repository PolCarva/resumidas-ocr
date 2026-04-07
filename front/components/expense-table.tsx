"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  ChevronDown,
  ChevronUp,
  Search,
  ArrowUpDown,
  AlertCircle,
  SlidersHorizontal,
  Check,
  Pencil,
  Trash2,
  Loader2,
  X,
} from "lucide-react"
import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { useExpenseStore } from "@/store/expenses"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { transactionService } from "@/lib/api"
import { toast } from "sonner"
import { EXPENSE_CATEGORIES, getCategoryColor, getCategoryIcon } from "@/lib/constants"
import {
  buildCombinedMovements,
  compareDisplayDates,
  toDateInputValue,
} from "@/lib/expense-insights"

type SortField = 'date' | 'description' | 'type' | 'category' | 'amount'
type SortDirection = 'asc' | 'desc'

interface ExpenseTableProps {
  activeCurrency?: 'UYU' | 'USD' | 'UNKNOWN' | null
}

function SimpleModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  isLoading,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText: string
  isLoading: boolean
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg animate-in fade-in zoom-in duration-200">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isLoading}
            className="h-6 w-6"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="mb-6 text-gray-600">{description}</p>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-red-500 text-white hover:bg-red-600"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Eliminando...
              </>
            ) : (
              confirmText
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function formatDateFilterValue(value: string): string {
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) {
    return value
  }

  return `${day}/${month}/${year}`
}

export function ExpenseTable({ activeCurrency = null }: ExpenseTableProps) {
  const allTransactions = useExpenseStore((state) => state.transactions)
  const movementsByCurrency = useExpenseStore((state) => state.movementsByCurrency)
  const updateTransactionCategory = useExpenseStore((state) => state.updateTransactionCategory)
  const removeTransaction = useExpenseStore((state) => state.removeTransaction)
  const isStoreUpdating = useExpenseStore((state) => state.isUpdating)

  const combinedMovements = useMemo(() => buildCombinedMovements({
    transactions: allTransactions,
    movementsByCurrency,
    activeCurrency,
  }), [allTransactions, movementsByCurrency, activeCurrency])

  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [amountRange, setAmountRange] = useState<[number, number]>([0, 0])
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  })
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [uiFreeze, setUiFreeze] = useState(false)
  const [expensePage, setExpensePage] = useState(1)
  const [incomePage, setIncomePage] = useState(1)
  const pendingActionRef = useRef<{ action: () => void; delay: number } | null>(null)

  const amountBounds = useMemo<[number, number]>(() => {
    if (combinedMovements.length === 0) {
      return [0, 0]
    }

    const amounts = combinedMovements.map((movement) => Math.abs(movement.amount))
    return [Math.min(...amounts), Math.max(...amounts)]
  }, [combinedMovements])

  useEffect(() => {
    setAmountRange((current) => {
      if (combinedMovements.length === 0) {
        return [0, 0]
      }

      if (current[0] === 0 && current[1] === 0) {
        return amountBounds
      }

      const nextMin = Math.max(amountBounds[0], Math.min(current[0], amountBounds[1]))
      const nextMax = Math.max(nextMin, Math.min(current[1], amountBounds[1]))

      if (nextMin === current[0] && nextMax === current[1]) {
        return current
      }

      return [nextMin, nextMax]
    })
  }, [amountBounds, combinedMovements.length])

  useEffect(() => {
    setExpensePage(1)
    setIncomePage(1)
  }, [
    searchTerm,
    categoryFilter,
    amountRange,
    dateRange.start,
    dateRange.end,
    activeCurrency,
  ])

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: activeCurrency === 'USD' ? 'USD' : 'UYU',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }, [activeCurrency])

  const renderSignedAmount = useCallback((amount: number, entryType: 'expense' | 'income') => {
    const prefix = entryType === 'income' ? '+' : '-'
    return `${prefix}${formatCurrency(Math.abs(amount))}`
  }, [formatCurrency])

  const renderCategoryIcon = (category: string) => {
    const Icon = getCategoryIcon(category)
    return <Icon className="h-4 w-4" style={{ color: getCategoryColor(category) }} />
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
      return
    }

    setSortField(field)
    setSortDirection(field === 'amount' ? 'desc' : 'asc')
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4 text-gray-400" />
    }

    return sortDirection === 'asc'
      ? <ChevronUp className="ml-1 h-4 w-4 text-blue-600" />
      : <ChevronDown className="ml-1 h-4 w-4 text-blue-600" />
  }

  const handleCategoryChange = async (transactionId: string, newCategory: string) => {
    try {
      setIsUpdating(true)

      const transactionToUpdate = allTransactions.find((transaction) => transaction.id === transactionId)
      if (!transactionToUpdate) {
        toast.error(`Error: La transacción con ID ${transactionId} no existe`)
        setEditingTransaction(null)
        return
      }

      const response = await transactionService.updateCategory(transactionId, newCategory)

      if (response && response.success) {
        updateTransactionCategory(transactionId, newCategory, {
          analysisText: transactionToUpdate.analysisText,
          accountNumber: transactionToUpdate.accountNumber,
        })

        if ((response.updatedTransactions || 0) > 1) {
          toast.success(`Se actualizaron ${response.updatedTransactions} movimientos de esa cuenta`)
        } else {
          toast.success("Categoría actualizada correctamente")
        }

        setEditingTransaction(null)
      } else {
        toast.error(`Error al actualizar la categoría: ${response?.message || 'Respuesta no exitosa'}`)
        setEditingTransaction(null)
      }
    } catch (error) {
      let errorMessage = 'Error desconocido'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else if (error && typeof error === 'object') {
        errorMessage = JSON.stringify(error)
      }

      toast.error(`Error al actualizar la categoría: ${errorMessage}`)
      setEditingTransaction(null)
    } finally {
      setIsUpdating(false)
    }
  }

  useEffect(() => {
    if (uiFreeze && pendingActionRef.current) {
      const timeoutId = setTimeout(() => {
        pendingActionRef.current?.action()

        setTimeout(() => {
          setUiFreeze(false)
          pendingActionRef.current = null
        }, 300)
      }, pendingActionRef.current.delay)

      return () => clearTimeout(timeoutId)
    }
  }, [uiFreeze])

  const handleDeleteTransaction = async (transactionId: string) => {
    if (isDeleting || isStoreUpdating) {
      return
    }

    try {
      setIsDeleting(true)
      setIsDialogOpen(false)

      const transaction = allTransactions.find((item) => item.id === transactionId)
      if (!transaction) {
        toast.error(`Error: La transacción con ID ${transactionId} no existe`)
        setTransactionToDelete(null)
        setIsDeleting(false)
        return
      }

      const transactionDescription = transaction.description || `ID: ${transactionId}`

      pendingActionRef.current = {
        delay: 200,
        action: () => {
          if (isStoreUpdating) {
            setTimeout(() => {
              pendingActionRef.current?.action()
            }, 500)
            return
          }

          try {
            removeTransaction(transactionId)

            setTimeout(() => {
              transactionService.deleteTransaction(transactionId)
                .then((response) => {
                  if (response && response.success) {
                    toast.success(`"${transactionDescription}" eliminada correctamente`)
                  } else {
                    toast.warning(response?.message || `"${transactionDescription}" eliminada.`)
                  }
                })
                .catch((error) => {
                  let errorMessage = 'Error desconocido'
                  if (error instanceof Error) {
                    errorMessage = error.message
                  } else if (typeof error === 'string') {
                    errorMessage = error
                  } else if (error && typeof error === 'object') {
                    errorMessage = JSON.stringify(error)
                  }

                  toast.warning(`"${transactionDescription}" eliminada del cliente, pero hubo un error en el servidor: ${errorMessage}`)
                })
                .finally(() => {
                  setIsDeleting(false)
                  setTransactionToDelete(null)
                })
            }, 300)
          } catch (error) {
            toast.error(`Error al eliminar la transacción: ${error instanceof Error ? error.message : 'Error desconocido'}`)
            setIsDeleting(false)
            setTransactionToDelete(null)
          }
        },
      }

      setUiFreeze(true)
    } catch (finalError) {
      toast.error(`Error al eliminar la transacción: ${finalError instanceof Error ? finalError.message : 'Error desconocido'}`)
      setIsDeleting(false)
      setTransactionToDelete(null)
    }
  }

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(combinedMovements.map((movement) => movement.category)))
      .sort((a, b) => a.localeCompare(b))
  }, [combinedMovements])

  const filteredAndSortedTransactions = useMemo(() => {
    const result = combinedMovements.filter((movement) => {
      const matchesSearch = movement.description.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = categoryFilter === 'all' || movement.category === categoryFilter

      const absoluteAmount = Math.abs(movement.amount)
      const matchesAmount = absoluteAmount >= amountRange[0] && absoluteAmount <= amountRange[1]

      const dateKey = toDateInputValue(movement.date)
      const matchesStart = !dateRange.start || dateKey >= dateRange.start
      const matchesEnd = !dateRange.end || dateKey <= dateRange.end

      return matchesSearch && matchesCategory && matchesAmount && matchesStart && matchesEnd
    })

    result.sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'date':
          comparison = compareDisplayDates(a.date, b.date)
          break
        case 'description':
          comparison = a.description.localeCompare(b.description)
          break
        case 'type':
          comparison = a.entryType.localeCompare(b.entryType)
          break
        case 'category':
          comparison = a.category.localeCompare(b.category)
          break
        case 'amount':
          comparison = Math.abs(a.amount) - Math.abs(b.amount)
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [
    amountRange,
    categoryFilter,
    combinedMovements,
    dateRange.end,
    dateRange.start,
    searchTerm,
    sortDirection,
    sortField,
  ])

  const filteredExpenses = useMemo(() =>
    filteredAndSortedTransactions.filter((movement) => movement.entryType === 'expense'),
  [filteredAndSortedTransactions])

  const filteredIncome = useMemo(() =>
    filteredAndSortedTransactions.filter((movement) => movement.entryType === 'income'),
  [filteredAndSortedTransactions])

  const expenseTotalPages = Math.max(1, Math.ceil(filteredExpenses.length / 20))
  const incomeTotalPages = Math.max(1, Math.ceil(filteredIncome.length / 20))

  useEffect(() => {
    if (expensePage > expenseTotalPages) {
      setExpensePage(expenseTotalPages)
    }
  }, [expensePage, expenseTotalPages])

  useEffect(() => {
    if (incomePage > incomeTotalPages) {
      setIncomePage(incomeTotalPages)
    }
  }, [incomePage, incomeTotalPages])

  const paginatedExpenses = useMemo(() => {
    const startIndex = (expensePage - 1) * 20
    return filteredExpenses.slice(startIndex, startIndex + 20)
  }, [expensePage, filteredExpenses])

  const paginatedIncome = useMemo(() => {
    const startIndex = (incomePage - 1) * 20
    return filteredIncome.slice(startIndex, startIndex + 20)
  }, [incomePage, filteredIncome])

  const filteredTotals = useMemo(() => {
    return filteredAndSortedTransactions.reduce((acc, movement) => {
      if (movement.entryType === 'income') {
        acc.income += Math.abs(movement.amount)
      } else {
        acc.expense += Math.abs(movement.amount)
      }
      return acc
    }, { income: 0, expense: 0 })
  }, [filteredAndSortedTransactions])

  const resetFilters = () => {
    setSearchTerm("")
    setCategoryFilter("all")
    setDateRange({ start: "", end: "" })
    setAmountRange(amountBounds)
  }

  const hasSearchFilter = searchTerm.trim().length > 0
  const hasCategoryFilter = categoryFilter !== 'all'
  const hasStartDateFilter = dateRange.start.length > 0
  const hasEndDateFilter = dateRange.end.length > 0
  const hasMinAmountFilter = amountRange[0] > amountBounds[0]
  const hasMaxAmountFilter = amountRange[1] < amountBounds[1]
  const activeFiltersCount = [
    hasSearchFilter,
    hasCategoryFilter,
    hasStartDateFilter,
    hasEndDateFilter,
    hasMinAmountFilter,
    hasMaxAmountFilter,
  ].filter(Boolean).length

  if (combinedMovements.length === 0) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No hay movimientos</AlertTitle>
          <AlertDescription>
            No se encontraron movimientos para mostrar. Añade nuevas transacciones o importa datos para comenzar.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (uiFreeze || isStoreUpdating) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <p className="text-lg text-gray-600">Procesando...</p>
      </div>
    )
  }

  const filteredNet = filteredTotals.income - filteredTotals.expense

  const expenseStartItem = filteredExpenses.length === 0 ? 0 : (expensePage - 1) * 20 + 1
  const expenseEndItem = Math.min(expensePage * 20, filteredExpenses.length)
  const incomeStartItem = filteredIncome.length === 0 ? 0 : (incomePage - 1) * 20 + 1
  const incomeEndItem = Math.min(incomePage * 20, filteredIncome.length)

  const renderSection = ({
    title,
    subtitle,
    emptyLabel,
    rows,
    allRows,
    page,
    totalPages,
    startItem,
    endItem,
    onPrev,
    onNext,
  }: {
    title: string
    subtitle: string
    emptyLabel: string
    rows: typeof paginatedExpenses
    allRows: typeof filteredExpenses
    page: number
    totalPages: number
    startItem: number
    endItem: number
    onPrev: () => void
    onNext: () => void
  }) => (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <p className="text-sm text-slate-500">
          {allRows.length} {allRows.length === 1 ? 'movimiento' : 'movimientos'}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead
                className="cursor-pointer font-semibold text-gray-600 hover:bg-gray-100"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center">
                  Fecha
                  {renderSortIcon('date')}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer font-semibold text-gray-600 hover:bg-gray-100"
                onClick={() => handleSort('description')}
              >
                <div className="flex items-center">
                  Descripción
                  {renderSortIcon('description')}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer font-semibold text-gray-600 hover:bg-gray-100"
                onClick={() => handleSort('category')}
              >
                <div className="flex items-center">
                  Categoría
                  {renderSortIcon('category')}
                </div>
              </TableHead>
              <TableHead
                className="cursor-pointer text-right font-semibold text-gray-600 hover:bg-gray-100"
                onClick={() => handleSort('amount')}
              >
                <div className="flex items-center justify-end">
                  Monto
                  {renderSortIcon('amount')}
                </div>
              </TableHead>
              <TableHead className="w-[110px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((movement, index) => (
                <motion.tr
                  key={movement.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: index * 0.03 }}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <TableCell className="font-medium text-gray-700">{movement.date}</TableCell>
                  <TableCell className="text-gray-700">{movement.description}</TableCell>
                  <TableCell>
                    {movement.editable && editingTransaction === movement.transactionId ? (
                      <Select
                        value={movement.category}
                        onValueChange={(value) => {
                          if (movement.transactionId) {
                            handleCategoryChange(movement.transactionId, value)
                          }
                        }}
                        disabled={isUpdating || isStoreUpdating}
                      >
                        <SelectTrigger className="h-8 w-full border-gray-200 px-2 py-0 text-xs">
                          <SelectValue placeholder="Seleccionar categoría">
                            {movement.category}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES
                            .filter((category) => category.value !== 'all' && category.value !== 'Ingresos')
                            .map((category) => {
                              const Icon = category.icon || getCategoryIcon(category.value)
                              return (
                                <SelectItem key={category.value} value={category.value}>
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4" style={{ color: category.color }} />
                                    {category.label}
                                  </div>
                                </SelectItem>
                              )
                            })}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="w-fit border-0 px-2 py-1"
                          style={{
                            backgroundColor: `${getCategoryColor(movement.category)}15`,
                            color: getCategoryColor(movement.category),
                          }}
                        >
                          <span className="flex items-center gap-1">
                            {renderCategoryIcon(movement.category)}
                            <span>{movement.category}</span>
                          </span>
                        </Badge>
                        {movement.editable ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setEditingTransaction(movement.transactionId || null)}
                          >
                            <Pencil className="h-3 w-3 text-gray-400" />
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${movement.entryType === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {renderSignedAmount(movement.amount, movement.entryType)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {movement.editable && editingTransaction === movement.transactionId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setEditingTransaction(null)}
                          disabled={isUpdating || isStoreUpdating}
                        >
                          <Check className="h-4 w-4 text-green-500" />
                        </Button>
                      ) : null}

                      {movement.deletable && movement.transactionId ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            setTransactionToDelete(movement.transactionId || null)
                            setIsDialogOpen(true)
                          }}
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-400">Solo lectura</span>
                      )}
                    </div>
                  </TableCell>
                </motion.tr>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-gray-600 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p>
            Mostrando {startItem}-{endItem} de {allRows.length} movimientos
          </p>
          <p className="text-xs text-gray-500">
            Página {page} de {totalPages} con 20 filas por página
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPrev} disabled={page === 1}>
            Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={page === totalPages}>
            Siguiente
          </Button>
        </div>
      </div>
    </section>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <Input
            placeholder="Buscar movimiento..."
            className="rounded-lg border-gray-200 pl-10 focus:border-blue-500 focus:ring-blue-500"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full rounded-lg border-gray-200 focus:border-blue-500 focus:ring-blue-500 lg:w-[240px]">
            <SelectValue placeholder="Filtrar por categoría" />
          </SelectTrigger>
          <SelectContent className="rounded-lg border-gray-200">
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categoryOptions.map((category) => {
              const Icon = getCategoryIcon(category)
              return (
                <SelectItem key={category} value={category}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color: getCategoryColor(category) }} />
                    {category}
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros avanzados
              {activeFiltersCount > 0 ? (
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
                  {activeFiltersCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Filtros avanzados</h4>
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Limpiar
                </Button>
              </div>

              <div className="space-y-2">
                <h5 className="text-sm font-medium">Rango de montos</h5>
                <div className="pt-4">
                  <Slider
                    value={amountRange}
                    min={amountBounds[0]}
                    max={amountBounds[1]}
                    step={1}
                    onValueChange={(value) => setAmountRange(value as [number, number])}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>{formatCurrency(amountRange[0])}</span>
                  <span>{formatCurrency(amountRange[1])}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h5 className="text-sm font-medium">Rango de fechas</h5>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="date-start" className="text-xs">Desde</Label>
                    <Input
                      id="date-start"
                      type="date"
                      className="mt-1"
                      value={dateRange.start}
                      onChange={(event) => setDateRange((current) => ({ ...current, start: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date-end" className="text-xs">Hasta</Label>
                    <Input
                      id="date-end"
                      type="date"
                      className="mt-1"
                      value={dateRange.end}
                      onChange={(event) => setDateRange((current) => ({ ...current, end: event.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {activeFiltersCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-600">Filtros activos:</span>

          {hasSearchFilter ? (
            <Badge variant="outline" className="gap-2 rounded-full border-slate-300 bg-white px-3 py-1 text-slate-700">
              <span>Texto: {searchTerm}</span>
              <button
                type="button"
                className="text-slate-400 transition hover:text-slate-700"
                onClick={() => setSearchTerm("")}
                aria-label="Quitar filtro de búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ) : null}

          {hasCategoryFilter ? (
            <Badge variant="outline" className="gap-2 rounded-full border-slate-300 bg-white px-3 py-1 text-slate-700">
              <span>Categoría: {categoryFilter}</span>
              <button
                type="button"
                className="text-slate-400 transition hover:text-slate-700"
                onClick={() => setCategoryFilter("all")}
                aria-label="Quitar filtro de categoría"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ) : null}

          {hasStartDateFilter ? (
            <Badge variant="outline" className="gap-2 rounded-full border-slate-300 bg-white px-3 py-1 text-slate-700">
              <span>Desde: {formatDateFilterValue(dateRange.start)}</span>
              <button
                type="button"
                className="text-slate-400 transition hover:text-slate-700"
                onClick={() => setDateRange((current) => ({ ...current, start: "" }))}
                aria-label="Quitar fecha desde"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ) : null}

          {hasEndDateFilter ? (
            <Badge variant="outline" className="gap-2 rounded-full border-slate-300 bg-white px-3 py-1 text-slate-700">
              <span>Hasta: {formatDateFilterValue(dateRange.end)}</span>
              <button
                type="button"
                className="text-slate-400 transition hover:text-slate-700"
                onClick={() => setDateRange((current) => ({ ...current, end: "" }))}
                aria-label="Quitar fecha hasta"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ) : null}

          {hasMinAmountFilter ? (
            <Badge variant="outline" className="gap-2 rounded-full border-slate-300 bg-white px-3 py-1 text-slate-700">
              <span>Monto desde: {formatCurrency(amountRange[0])}</span>
              <button
                type="button"
                className="text-slate-400 transition hover:text-slate-700"
                onClick={() => setAmountRange((current) => [amountBounds[0], current[1]])}
                aria-label="Quitar monto mínimo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ) : null}

          {hasMaxAmountFilter ? (
            <Badge variant="outline" className="gap-2 rounded-full border-slate-300 bg-white px-3 py-1 text-slate-700">
              <span>Monto hasta: {formatCurrency(amountRange[1])}</span>
              <button
                type="button"
                className="text-slate-400 transition hover:text-slate-700"
                onClick={() => setAmountRange((current) => [current[0], amountBounds[1]])}
                aria-label="Quitar monto máximo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Badge>
          ) : null}

          <Button variant="ghost" size="sm" className="ml-auto" onClick={resetFilters}>
            Limpiar filtros
          </Button>
        </div>
      ) : null}

      {renderSection({
        title: "Gastos",
        subtitle: "Movimientos debitados o categorizados como egreso.",
        emptyLabel: "No se encontraron gastos.",
        rows: paginatedExpenses,
        allRows: filteredExpenses,
        page: expensePage,
        totalPages: expenseTotalPages,
        startItem: expenseStartItem,
        endItem: expenseEndItem,
        onPrev: () => setExpensePage((page) => Math.max(1, page - 1)),
        onNext: () => setExpensePage((page) => Math.min(expenseTotalPages, page + 1)),
      })}

      {renderSection({
        title: "Ingresos",
        subtitle: "Créditos detectados en el estado de cuenta.",
        emptyLabel: "No se encontraron ingresos.",
        rows: paginatedIncome,
        allRows: filteredIncome,
        page: incomePage,
        totalPages: incomeTotalPages,
        startItem: incomeStartItem,
        endItem: incomeEndItem,
        onPrev: () => setIncomePage((page) => Math.max(1, page - 1)),
        onNext: () => setIncomePage((page) => Math.min(incomeTotalPages, page + 1)),
      })}

      <SimpleModal
        isOpen={isDialogOpen}
        onClose={() => {
          if (isDeleting || isStoreUpdating) return
          setIsDialogOpen(false)
          setTransactionToDelete(null)
        }}
        onConfirm={() => {
          if (isDeleting || isStoreUpdating) return
          if (transactionToDelete) {
            handleDeleteTransaction(transactionToDelete)
          }
        }}
        title="¿Eliminar transacción?"
        description="Esta acción no se puede deshacer. Se eliminará permanentemente esta transacción de tus registros."
        confirmText="Eliminar"
        isLoading={isDeleting}
      />

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-gray-600">
        <span className="font-medium text-emerald-700">Ingresos filtrados: {formatCurrency(filteredTotals.income)}</span>
        <span className="font-medium text-rose-700">Gastos filtrados: {formatCurrency(filteredTotals.expense)}</span>
        <span className={`font-medium ${filteredNet >= 0 ? 'text-sky-700' : 'text-amber-700'}`}>
          Neto filtrado: {filteredNet >= 0 ? formatCurrency(filteredNet) : `-${formatCurrency(Math.abs(filteredNet))}`}
        </span>
      </div>
    </div>
  )
}
