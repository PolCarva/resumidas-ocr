import { create } from 'zustand'
import { getCategoryColor } from '@/lib/constants'

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  type: string
  category: string
  currency?: 'UYU' | 'USD' | 'UNKNOWN'
  accountNumber?: string
  analysisText?: string
}

interface CategoryUpdateOptions {
  accountNumber?: string
  analysisText?: string
}

interface CategoryData {
  name: string
  value: number
  color: string
}

interface DailyData {
  day: string
  amount: number
}

interface CurrencyMovementItem {
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit' | 'balance'
  currency: 'UYU' | 'USD' | 'UNKNOWN'
  accountNumber?: string
  sourceRef?: {
    rowId: string
    rowIndex: number
    page?: number
    sourceType?: 'pdf' | 'csv'
  }
}

interface CurrencyMovementsData {
  currency: 'UYU' | 'USD' | 'UNKNOWN'
  rawCurrencies: string[]
  accountNumbers: string[]
  debits: CurrencyMovementItem[]
  credits: CurrencyMovementItem[]
  balances: CurrencyMovementItem[]
}

interface ExpenseState {
  transactions: Transaction[]
  categoryData: CategoryData[]
  dailyData: DailyData[]
  movementsByCurrency: CurrencyMovementsData[]
  error: string | null
  isLoading: boolean
  isUpdating: boolean
  setExpenseData: (data: {
    transactions: Transaction[]
    categoryData: CategoryData[]
    dailyData: DailyData[]
    movementsByCurrency?: CurrencyMovementsData[]
  }) => void
  updateTransactionCategory: (
    transactionId: string,
    newCategory: string,
    options?: CategoryUpdateOptions,
  ) => void
  removeTransaction: (transactionId: string) => void
  recalculateCategoryData: () => void
  setError: (error: string | null) => void
  setLoading: (isLoading: boolean) => void
  clearData: () => void
}

// Referencia para control de actualizaciones de isLoading
let loadingTimeoutId: NodeJS.Timeout | null = null;

const normalizeLookupText = (value?: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  transactions: [],
  categoryData: [],
  dailyData: [],
  movementsByCurrency: [],
  error: null,
  isLoading: false,
  isUpdating: false,
  setExpenseData: (data) => {
    if (get().isUpdating) {
      console.warn('Hay una actualización en progreso. setExpenseData ignorado.');
      return;
    }
    
    set({
      transactions: data.transactions || [],
      categoryData: data.categoryData || [],
      dailyData: data.dailyData || [],
      movementsByCurrency: data.movementsByCurrency || [],
      error: null
    });
  },
  updateTransactionCategory: (transactionId, newCategory, options) => {
    console.log(`Store: Actualizando categoría. ID: ${transactionId}, Nueva categoría: ${newCategory}`);
    
    if (get().isUpdating) {
      console.warn('Hay una actualización en progreso. updateTransactionCategory ignorado.');
      return;
    }
    
    const currentTransactions = get().transactions;
    const transactionToUpdate = currentTransactions.find(t => t.id === transactionId);
    
    if (!transactionToUpdate) {
      console.error(`No se encontró la transacción con ID ${transactionId} en el store`);
      return;
    }
    
    console.log(`Transacción encontrada en el store:`, transactionToUpdate);
    console.log(`Cambiando categoría de "${transactionToUpdate.category}" a "${newCategory}"`);

    const targetAccountNumber = options?.accountNumber ?? transactionToUpdate.accountNumber;
    const targetLookupText = normalizeLookupText(
      options?.analysisText ?? transactionToUpdate.analysisText ?? transactionToUpdate.description
    );

    try {
      set({ isUpdating: true });
      
      const updatedTransactions = currentTransactions.map(transaction => 
        (
          transaction.id === transactionId
          || (
            !!targetLookupText
            && normalizeLookupText(transaction.analysisText ?? transaction.description) === targetLookupText
            && (targetAccountNumber
              ? transaction.accountNumber === targetAccountNumber
              : true)
          )
        )
          ? { ...transaction, category: newCategory }
          : transaction
      );
      
      set({ transactions: updatedTransactions, isUpdating: false });
      
      setTimeout(() => {
        set({ isUpdating: true });
        const currentState = get();
        
        const categoryTotals: Record<string, number> = {};
        
        currentState.transactions.forEach(transaction => {
          const category = transaction.category;
          if (!categoryTotals[category]) {
            categoryTotals[category] = 0;
          }
          categoryTotals[category] += Math.abs(transaction.amount);
        });
        
        const newCategoryData = Object.entries(categoryTotals).map(([name, value]) => ({
          name,
          value,
          color: getCategoryColor(name)
        }));
        
        set({ 
          categoryData: newCategoryData,
          isUpdating: false 
        });
      }, 50);
    } catch (error) {
      console.error("Error al actualizar categoría:", error);
      set({ isUpdating: false });
    }
  },
  removeTransaction: (transactionId) => {
    console.log(`Store: Eliminando transacción con ID: ${transactionId}`);
    
    if (get().isUpdating) {
      console.warn('Hay una actualización en progreso. Operación ignorada.');
      return;
    }
    
    try {
      // Marcar que estamos en proceso de actualización
      set({ isUpdating: true });
      
      const currentTransactions = get().transactions;
      const transactionToDelete = currentTransactions.find(t => t.id === transactionId);
      
      if (!transactionToDelete) {
        console.error(`No se encontró la transacción con ID ${transactionId} en el store`);
        // Desmarcar el estado de actualización
        setTimeout(() => set({ isUpdating: false }), 0);
        return;
      }
      
      console.log(`Transacción encontrada en el store:`, transactionToDelete);
      
      // Filtrar las transacciones para eliminar la que tiene el ID indicado
      const updatedTransactions = currentTransactions.filter(transaction => 
        transaction.id !== transactionId
      );
      
      // Actualizar las transacciones en el siguiente ciclo para evitar problemas
      setTimeout(() => {
        try {
          // Actualizar las transacciones
          set({ transactions: updatedTransactions });
          
          // Programar los recálculos en un ciclo posterior
          setTimeout(() => {
            // Recalcular categorías
            const categoryTotals: Record<string, number> = {};
            const updatedState = get().transactions; // Obtener de nuevo para asegurar consistencia
            
            updatedState.forEach(transaction => {
              const category = transaction.category;
              if (!categoryTotals[category]) {
                categoryTotals[category] = 0;
              }
              categoryTotals[category] += Math.abs(transaction.amount);
            });
            
            const newCategoryData = Object.entries(categoryTotals).map(([name, value]) => ({
              name,
              value,
              color: getCategoryColor(name)
            }));
            
            // Recalcular datos diarios
            const dailyTotals: Record<string, number> = {};
            updatedState.forEach(transaction => {
              const day = transaction.date.substring(0, 5);
              if (!dailyTotals[day]) {
                dailyTotals[day] = 0;
              }
              dailyTotals[day] += Math.abs(transaction.amount);
            });
            
            const newDailyData = Object.entries(dailyTotals).map(([day, amount]) => ({
              day,
              amount
            })).sort((a, b) => {
              const [dayA, monthA] = a.day.split('/').map(Number);
              const [dayB, monthB] = b.day.split('/').map(Number);
              return monthA === monthB ? dayA - dayB : monthA - monthB;
            });
            
            // Actualizar los datos calculados
            set({
              categoryData: newCategoryData,
              dailyData: newDailyData,
              isUpdating: false // Finalizar actualización
            });
            
            console.log('Recálculos completados después de eliminar la transacción');
          }, 50);
        } catch (innerError) {
          console.error('Error durante los cálculos:', innerError);
          set({ isUpdating: false });
        }
      }, 10);
    } catch (error) {
      console.error('Error al eliminar la transacción:', error);
      setTimeout(() => set({ isUpdating: false }), 0);
    }
  },
  recalculateCategoryData: () => {
    if (get().isUpdating) {
      console.warn('Hay una actualización en progreso. recalculateCategoryData ignorado.');
      return;
    }
    
    try {
      set({ isUpdating: true });
      
      const { transactions } = get();
      
      const categoryTotals: Record<string, number> = {};
      
      transactions.forEach(transaction => {
        const category = transaction.category;
        if (!categoryTotals[category]) {
          categoryTotals[category] = 0;
        }
        categoryTotals[category] += Math.abs(transaction.amount);
      });
      
      const newCategoryData = Object.entries(categoryTotals).map(([name, value]) => ({
        name,
        value,
        color: getCategoryColor(name)
      }));
      
      set({ 
        categoryData: newCategoryData,
        isUpdating: false
      });
    } catch (error) {
      console.error("Error al recalcular datos de categoría:", error);
      set({ isUpdating: false });
    }
  },
  setError: (error) => {
    if (get().error === error) {
      return;
    }
    
    if (get().isUpdating) {
      console.warn('Hay una actualización en progreso. setError ignorado.');
      return;
    }
    
    set({ error });
  },
  setLoading: (isLoading) => {
    // Evitar actualizaciones innecesarias si el valor es el mismo
    if (get().isLoading === isLoading) {
      return;
    }
    
    // Protección contra actualizaciones mientras otra está en progreso
    if (get().isUpdating && isLoading) {
      console.warn('Hay una actualización en progreso. setLoading ignorado.');
      return;
    }
    
    // Cancelar cualquier actualización pendiente
    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
    }
    
    // Usar setTimeout para romper el ciclo de renderización
    // en lugar de actualizar el estado directamente
    loadingTimeoutId = setTimeout(() => {
      set({ isLoading });
      loadingTimeoutId = null;
    }, 10);
  },
  clearData: () => {
    if (get().isUpdating) {
      console.warn('Hay una actualización en progreso. clearData ignorado.');
      return;
    }
    
    set({ 
      transactions: [], 
      categoryData: [], 
      dailyData: [],
      movementsByCurrency: [],
      error: null 
    });
  },
}))
