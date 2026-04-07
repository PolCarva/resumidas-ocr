import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// Interfaces para los datos de análisis
interface Transaction {
  date: string;
  description: string;
  amount: number;
  category: string;
}

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

interface DailyData {
  day: string;
  amount: number;
}

// Interfaz para los datos de análisis
interface AnalysisData {
  id: string;
  fileName: string;
  originalFileName: string;
  createdAt: string;
  transactions: Transaction[];
  categoryData: CategoryData[];
  dailyData: DailyData[];
}

// Función para extraer el mes y año de las transacciones
function extractMonthYear(transactions: Transaction[]): string {
  if (!transactions || transactions.length === 0) {
    return 'Sin fecha';
  }

  try {
    // Intentar obtener la fecha de la primera transacción
    const firstTransaction = transactions[0];
    if (firstTransaction && firstTransaction.date) {
      // Formato esperado: DD/MM/YYYY
      const dateParts = firstTransaction.date.split('/');
      if (dateParts.length === 3) {
        const month = parseInt(dateParts[1]);
        const year = dateParts[2];
        
        // Convertir número de mes a nombre
        const monthNames = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        
        return `${monthNames[month - 1]} ${year}`;
      }
    }
    return 'Sin fecha';
  } catch (error) {
    console.error('Error al extraer mes y año:', error);
    return 'Sin fecha';
  }
}

interface AnalysisRequestData {
  fileName: string;
  transactions: Transaction[];
  categoryData: CategoryData[];
  dailyData: DailyData[];
}

export async function POST(req: NextRequest) {
  console.log('Guardando análisis en localStorage');
  try {
    const data = await req.json() as AnalysisRequestData;
    
    if (!data.fileName || !data.transactions || !data.categoryData || !data.dailyData) {
      return NextResponse.json(
        { error: 'Datos incompletos para guardar el análisis' },
        { status: 400 }
      );
    }

    // Extraer el mes y año de las transacciones
    const monthYear = extractMonthYear(data.transactions);
    
    // Crear un objeto con los datos del análisis
    const analysisData: AnalysisData = {
      id: uuidv4(),
      fileName: monthYear, // Usar el mes y año como nombre del archivo
      originalFileName: data.fileName, // Guardar el nombre original del archivo
      createdAt: new Date().toISOString(),
      transactions: data.transactions,
      categoryData: data.categoryData,
      dailyData: data.dailyData
    };

    // En un entorno de producción, aquí se guardaría en una base de datos
    // Como estamos en el lado del servidor de Next.js, no podemos usar localStorage directamente
    // Así que vamos a devolver los datos para que el cliente los guarde

    return NextResponse.json({
      success: true,
      message: 'Análisis guardado correctamente',
      data: analysisData
    });
  } catch (error: unknown) {
    const typedError = error as { message?: string };
    console.error('Error al guardar análisis:', error);
    return NextResponse.json(
      { 
        error: 'Error al guardar análisis',
        details: typedError?.message || 'Error desconocido'
      },
      { status: 500 }
    );
  }
} 