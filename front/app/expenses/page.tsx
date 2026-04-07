'use client';

import { useEffect, useMemo, useState } from "react";
import { ExpenseSummary } from "@/components/expense-summary"
import { ExpenseTable } from "@/components/expense-table"
import { useExpenseStore } from "@/store/expenses";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

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
  const clearData = useExpenseStore((state) => state.clearData);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileError = searchParams.get('error');
  
  // Estado para controlar si se debe mostrar el error
  const [showError, setShowError] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  // Obtener el usuario actual
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  // Estado para almacenar el ID del usuario asociado a los datos
  const [dataUserId, setDataUserId] = useState<string | null>(null);
  const [activeCurrency, setActiveCurrency] = useState<'UYU' | 'USD' | 'UNKNOWN' | null>(null);

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
      // Limpiar datos del localStorage y del store
      localStorage.removeItem('lastViewedTransactions');
      localStorage.removeItem('lastViewedCategoryData');
      localStorage.removeItem('lastViewedDailyData');
      localStorage.removeItem('lastViewedMovementsByCurrency');
      localStorage.removeItem('lastViewedUserId');
      clearData();
      setDataUserId(null);
      
      // Establecer mensaje de error
      setError(`El archivo seleccionado está dañado o no se puede procesar. Por favor, intenta con otro archivo.`);
      
      // Limpiar la URL para evitar que el error persista en recargas
      const timer = setTimeout(() => {
        router.replace('/expenses');
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [fileError, clearData, setError, router]);

  // Verificar si el usuario actual tiene permiso para ver los datos
  useEffect(() => {
    // Si no hay usuario autenticado, no hay nada que verificar
    if (!isAuthenticated || !user) {
      return;
    }
    
    // Si hay datos cargados, verificar si pertenecen al usuario actual
    if (transactions.length > 0 && dataUserId && dataUserId !== user.id) {
      console.log('Los datos pertenecen a otro usuario:', {
        dataUserId,
        currentUserId: user.id
      });
      
      // Limpiar los datos y mostrar un error
      clearData();
      setError('No tienes permiso para ver estos datos. Se han cargado datos de otro usuario.');
    }
  }, [isAuthenticated, user, transactions.length, dataUserId, clearData, setError]);

  // Cargar datos del localStorage al iniciar
  useEffect(() => {
    if (fileError) {
      return;
    }

    // Si ya tenemos datos en memoria del análisis actual, no bloquear la pantalla.
    if (transactions.length > 0 && isAuthenticated && user && (!dataUserId || dataUserId === user.id)) {
      if (!dataUserId) {
        setDataUserId(user.id);
      }
      setError(null);
      setLoading(false);
      setInitialLoadComplete(true);
      return;
    }

    setLoading(true);
    try {
      const savedTransactions = localStorage.getItem('lastViewedTransactions');
      const savedCategoryData = localStorage.getItem('lastViewedCategoryData');
      const savedDailyData = localStorage.getItem('lastViewedDailyData');
      const savedMovementsByCurrency = localStorage.getItem('lastViewedMovementsByCurrency');
      const savedUserId = localStorage.getItem('lastViewedUserId');
      
      if (savedUserId) {
        setDataUserId(savedUserId);
      }
      
      const belongsToCurrentUser = isAuthenticated && user && savedUserId === user.id;
      
      if (savedTransactions && savedCategoryData && savedDailyData && belongsToCurrentUser) {
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
        } catch (parseError) {
          console.error('Error al parsear datos del localStorage:', parseError);
          setError('Error al procesar los datos guardados. Es posible que estén corruptos o en un formato incorrecto.');
          
          localStorage.removeItem('lastViewedTransactions');
          localStorage.removeItem('lastViewedCategoryData');
          localStorage.removeItem('lastViewedDailyData');
          localStorage.removeItem('lastViewedMovementsByCurrency');
          localStorage.removeItem('lastViewedUserId');
          setDataUserId(null);
        }
      } else if (savedUserId && isAuthenticated && user && savedUserId !== user.id) {
        clearData();
        setError('No tienes permiso para ver estos datos. Se han cargado datos de otro usuario.');
      } else {
        setError(null);
      }
    } catch (error) {
      console.error('Error al cargar datos del localStorage:', error);
      setError('Error al cargar los datos. Por favor, intenta recargar la página.');
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  }, [transactions.length, setExpenseData, setError, setLoading, fileError, clearData, user, isAuthenticated, dataUserId]);

  // Guardar datos en localStorage cuando cambien
  useEffect(() => {
    if (transactions.length > 0 && !error && isAuthenticated && user) {
      try {
        localStorage.setItem('lastViewedTransactions', JSON.stringify(transactions));
        localStorage.setItem('lastViewedCategoryData', JSON.stringify(categoryData));
        localStorage.setItem('lastViewedDailyData', JSON.stringify(dailyData));
        localStorage.setItem('lastViewedMovementsByCurrency', JSON.stringify(movementsByCurrency));
        localStorage.setItem('lastViewedUserId', user.id);
        setDataUserId(user.id);
        // Si se guardaron correctamente, limpiar cualquier error previo
        setError(null);
      } catch (error) {
        console.error('Error al guardar datos en localStorage:', error);
        setError('Error al guardar los datos. Es posible que el almacenamiento local esté lleno o no disponible.');
      }
    }
  }, [transactions, categoryData, dailyData, movementsByCurrency, setError, error, isAuthenticated, user]);

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
    <main className="container mx-auto py-8 px-4 space-y-8">
      {showError && error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {!error && transactions.length > 0 && isAuthenticated && user && (!dataUserId || dataUserId === user.id) ? (
            <>
              {availableCurrencies.length > 0 ? (
                <Tabs
                  value={effectiveActiveCurrency || availableCurrencies[0]}
                  onValueChange={(value) => setActiveCurrency(value as 'UYU' | 'USD' | 'UNKNOWN')}
                  className="w-full"
                >
                  <TabsList
                    className={`grid w-full max-w-sm mb-2 ${
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
              ) : null}
              <ExpenseSummary activeCurrency={effectiveActiveCurrency} />
              <ExpenseTable activeCurrency={effectiveActiveCurrency} />
            </>
          ) : (
            <div className="text-center py-12">
              <h2 className="text-xl font-semibold mb-2">No hay datos disponibles</h2>
              <p className="text-muted-foreground">
                {error ? 
                  "Se ha producido un error al cargar los datos." : 
                  "No se encontraron transacciones. Añade nuevas transacciones o importa datos para comenzar."
                }
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
