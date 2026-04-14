'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExpenseSummary } from "@/components/expense-summary"
import { ExpenseTable } from "@/components/expense-table"
import { useExpenseStore } from "@/store/expenses";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import {
  clearStoredExpenseSnapshot,
  readStoredExpenseSnapshot,
  saveStoredExpenseSnapshot,
} from "@/lib/expense-cache";

export default function ExpensesPage() {
  const transactions = useExpenseStore((state) => state.transactions);
  const categoryData = useExpenseStore((state) => state.categoryData);
  const dailyData = useExpenseStore((state) => state.dailyData);
  const movementsByCurrency = useExpenseStore((state) => state.movementsByCurrency);
  const setExpenseData = useExpenseStore((state) => state.setExpenseData);
  const error = useExpenseStore((state) => state.error);
  const setError = useExpenseStore((state) => state.setError);
  const isLoading = useExpenseStore((state) => state.isLoading);
  const setLoading = useExpenseStore((state) => state.setLoading);
  const resetExpenseState = useExpenseStore((state) => state.resetState);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileError = searchParams.get('error');
  
  // Estado para controlar si se debe mostrar el error
  const [showError, setShowError] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  // Obtener el usuario actual
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydratedAuth = useAuthStore((state) => state.hasHydrated);
  
  // Estado para almacenar el ID del usuario asociado a los datos
  const [dataUserId, setDataUserId] = useState<string | null>(null);
  const [activeCurrency, setActiveCurrency] = useState<'UYU' | 'USD' | 'UNKNOWN' | null>(null);
  const previousUserIdRef = useRef<string | null>(null);

  const resetExpensesView = useCallback(() => {
    clearStoredExpenseSnapshot();
    resetExpenseState();
    setDataUserId(null);
    setActiveCurrency(null);
  }, [resetExpenseState]);

  const availableCurrencies = useMemo(() => {
    const found = new Set<'UYU' | 'USD' | 'UNKNOWN'>();

    for (const bucket of movementsByCurrency) {
      if (
        bucket.debits.length > 0 ||
        bucket.credits.length > 0 ||
        bucket.balances.length > 0
      ) {
        found.add(bucket.currency);
      }
    }

    for (const transaction of transactions) {
      if (transaction.currency) {
        found.add(transaction.currency);
      }
    }

    const sorted: Array<'UYU' | 'USD' | 'UNKNOWN'> = [];
    if (found.has('UYU')) sorted.push('UYU');
    if (found.has('USD')) sorted.push('USD');
    if (found.has('UNKNOWN')) sorted.push('UNKNOWN');
    return sorted;
  }, [movementsByCurrency, transactions]);

  const effectiveActiveCurrency = useMemo(() => {
    if (activeCurrency && availableCurrencies.includes(activeCurrency)) {
      return activeCurrency;
    }

    return availableCurrencies[0] || null;
  }, [activeCurrency, availableCurrencies]);

  useEffect(() => {
    if (availableCurrencies.length === 0) {
      setActiveCurrency(null);
      return;
    }

    if (!activeCurrency || !availableCurrencies.includes(activeCurrency)) {
      setActiveCurrency(availableCurrencies[0]);
    }
  }, [availableCurrencies, activeCurrency]);

  // Manejar errores de archivo roto
  useEffect(() => {
    if (fileError === 'true') {
      resetExpensesView();
      
      // Establecer mensaje de error
      setError(`El archivo seleccionado está dañado o no se puede procesar. Por favor, intenta con otro archivo.`);
      
      // Limpiar la URL para evitar que el error persista en recargas
      const timer = setTimeout(() => {
        router.replace('/expenses');
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [fileError, resetExpensesView, setError, router]);

  useEffect(() => {
    if (!hasHydratedAuth || fileError === 'true') {
      return;
    }

    const currentUserId = user?.id ?? null;
    const previousUserId = previousUserIdRef.current;

    if (previousUserId && currentUserId && previousUserId !== currentUserId) {
      resetExpensesView();
      setError(null);
    }

    previousUserIdRef.current = currentUserId;

    if (!isAuthenticated || !currentUserId) {
      previousUserIdRef.current = null;
    }
  }, [hasHydratedAuth, fileError, isAuthenticated, user, resetExpensesView, setError]);

  // Cargar datos del localStorage al iniciar
  useEffect(() => {
    if (!hasHydratedAuth || fileError) {
      return;
    }

    if (!isAuthenticated || !user) {
      resetExpenseState();
      setDataUserId(null);
      setInitialLoadComplete(true);
      return;
    }

    const currentUserId = user.id;

    if (transactions.length > 0 && (!dataUserId || dataUserId === currentUserId)) {
      if (dataUserId !== currentUserId) {
        setDataUserId(currentUserId);
      }

      setError(null);
      setLoading(false);
      setInitialLoadComplete(true);
      return;
    }

    setLoading(true);
    try {
      const snapshot = readStoredExpenseSnapshot();
      const savedTransactions = snapshot?.transactions;
      const savedCategoryData = snapshot?.categoryData;
      const savedDailyData = snapshot?.dailyData;
      const savedMovementsByCurrency = snapshot?.movementsByCurrency;
      const savedUserId = snapshot?.userId;
      
      if (savedUserId) {
        setDataUserId(savedUserId);
      }
      
      if (savedTransactions && savedCategoryData && savedDailyData && savedUserId === currentUserId) {
        try {
          const parsedTransactions = JSON.parse(savedTransactions);
          const parsedCategoryData = JSON.parse(savedCategoryData);
          const parsedDailyData = JSON.parse(savedDailyData);
          const parsedMovementsByCurrency = savedMovementsByCurrency
            ? JSON.parse(savedMovementsByCurrency)
            : [];
          
          setExpenseData({
            transactions: parsedTransactions,
            categoryData: parsedCategoryData,
            dailyData: parsedDailyData,
            movementsByCurrency: parsedMovementsByCurrency
          });
          setDataUserId(currentUserId);
          setError(null);
        } catch (parseError) {
          console.error('Error al parsear datos del localStorage:', parseError);
          resetExpensesView();
          setError('Error al procesar los datos guardados. Es posible que estén corruptos o en un formato incorrecto.');
        }
      } else if (savedUserId && savedUserId !== currentUserId) {
        resetExpensesView();
        setError(null);
      } else {
        resetExpenseState();
        setError(null);
        setDataUserId(null);
      }
    } catch (error) {
      console.error('Error al cargar datos del localStorage:', error);
      setError('Error al cargar los datos. Por favor, intenta recargar la página.');
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  }, [
    hasHydratedAuth,
    transactions.length,
    dataUserId,
    setExpenseData,
    setError,
    setLoading,
    fileError,
    resetExpenseState,
    resetExpensesView,
    user,
    isAuthenticated,
  ]);

  // Guardar datos en localStorage cuando cambien
  useEffect(() => {
    if (transactions.length > 0 && !error && hasHydratedAuth && isAuthenticated && user) {
      try {
        const existingAnalysisId = readStoredExpenseSnapshot()?.analysisId ?? null;

        saveStoredExpenseSnapshot({
          transactions,
          categoryData,
          dailyData,
          movementsByCurrency,
          userId: user.id,
          analysisId: existingAnalysisId,
        });

        if (dataUserId !== user.id) {
          setDataUserId(user.id);
        }
      } catch (error) {
        console.error('Error al guardar datos en localStorage:', error);
        setError('Error al guardar los datos. Es posible que el almacenamiento local esté lleno o no disponible.');
      }
    }
  }, [transactions, categoryData, dailyData, movementsByCurrency, setError, error, hasHydratedAuth, isAuthenticated, user, dataUserId]);

  // Controlar cuándo mostrar el error
  useEffect(() => {
    // Solo mostrar el error después de que la carga inicial se haya completado
    // y si hay un error o si estamos mostrando un error de archivo
    if (initialLoadComplete) {
      if (fileError === 'true') {
        // Mostrar inmediatamente si es un error de archivo
        setShowError(true);
      } else if (error) {
        // Para otros errores, esperar un poco para evitar parpadeos
        const timer = setTimeout(() => {
          setShowError(true);
        }, 300);
        return () => clearTimeout(timer);
      } else {
        setShowError(false);
      }
    }
  }, [error, fileError, initialLoadComplete]);

  return (
    <main className="page-shell pb-10">
      <div className="page-section space-y-6">
      {showError && error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {isLoading ? (
        <div className="surface-card flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="text-sm font-medium text-slate-500">Cargando información financiera...</p>
          </div>
        </div>
      ) : (
        <>
          {!error && transactions.length > 0 && isAuthenticated && user && (!dataUserId || dataUserId === user.id) ? (
            <>
              {availableCurrencies.length > 0 ? (
                <div className="flex justify-end">
                  <Tabs
                    value={effectiveActiveCurrency || availableCurrencies[0]}
                    onValueChange={(value) => setActiveCurrency(value as 'UYU' | 'USD' | 'UNKNOWN')}
                    className="w-full max-w-sm"
                  >
                    <TabsList
                      className={`grid w-full ${
                        availableCurrencies.length === 1
                          ? 'grid-cols-1'
                          : availableCurrencies.length === 2
                            ? 'grid-cols-2'
                            : 'grid-cols-3'
                      }`}
                    >
                      {availableCurrencies.map((currency) => (
                        <TabsTrigger key={currency} value={currency}>
                          {currency}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              ) : null}
              <ExpenseSummary activeCurrency={effectiveActiveCurrency} />
              <ExpenseTable activeCurrency={effectiveActiveCurrency} />
            </>
          ) : (
            <div className="surface-card py-16 text-center">
              <h2 className="text-xl font-semibold text-slate-950">No hay datos disponibles</h2>
              <p className="mt-3 text-base leading-7 text-slate-500">
                {error ? 
                  "Se ha producido un error al cargar los datos." : 
                  "No se encontraron transacciones. Añade nuevas transacciones o importa datos para comenzar."
                }
              </p>
            </div>
          )}
        </>
      )}
      </div>
    </main>
  );
}
