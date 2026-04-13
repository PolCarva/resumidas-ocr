'use client';

import { useState, useEffect, useMemo, memo } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  FileText, 
  BarChart, 
  Trash2, 
  CheckCircle2, 
  Edit, 
  PieChart, 
  LineChart, 
  BarChart2, 
  Activity, 
  DollarSign, 
  CreditCard,
  GripVertical
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExpenseStore } from '@/store/expenses';
import { useAuthStore } from '@/store/auth';
import { clearStoredExpenseSnapshot, saveStoredExpenseSnapshot } from '@/lib/expense-cache';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  MeasuringStrategy
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { financialService } from '@/lib/api';

// Definir opciones de iconos
const iconOptions = [
  { value: 'BarChart', icon: BarChart, label: 'Gráfico de Barras' },
  { value: 'PieChart', icon: PieChart, label: 'Gráfico Circular' },
  { value: 'LineChart', icon: LineChart, label: 'Gráfico de Líneas' },
  { value: 'BarChart2', icon: BarChart2, label: 'Gráfico de Barras 2' },
  { value: 'Activity', icon: Activity, label: 'Actividad' },
  { value: 'DollarSign', icon: DollarSign, label: 'Signo de Dólar' },
  { value: 'CreditCard', icon: CreditCard, label: 'Tarjeta de Crédito' },
];

// Definir opciones de colores
const colorOptions = [
  { value: 'blue', bgClass: 'bg-blue-100', textClass: 'text-blue-600', dotClass: 'bg-blue-600', label: 'Azul' },
  { value: 'purple', bgClass: 'bg-purple-100', textClass: 'text-purple-600', dotClass: 'bg-purple-600', label: 'Púrpura' },
  { value: 'green', bgClass: 'bg-green-100', textClass: 'text-green-600', dotClass: 'bg-green-600', label: 'Verde' },
  { value: 'yellow', bgClass: 'bg-yellow-100', textClass: 'text-yellow-600', dotClass: 'bg-yellow-600', label: 'Amarillo' },
  { value: 'red', bgClass: 'bg-red-100', textClass: 'text-red-600', dotClass: 'bg-red-600', label: 'Rojo' },
  { value: 'indigo', bgClass: 'bg-indigo-100', textClass: 'text-indigo-600', dotClass: 'bg-indigo-600', label: 'Índigo' },
  { value: 'pink', bgClass: 'bg-pink-100', textClass: 'text-pink-600', dotClass: 'bg-pink-600', label: 'Rosa' },
];

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  type: 'income' | 'expense';
}

interface CategoryData {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

interface DailyData {
  date: string;
  income: number;
  expense: number;
  balance: number;
}

interface CurrencyMovementItem {
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit' | 'balance';
  currency: 'UYU' | 'USD' | 'UNKNOWN';
  accountNumber?: string;
}

interface CurrencyMovementsData {
  currency: 'UYU' | 'USD' | 'UNKNOWN';
  rawCurrencies: string[];
  accountNumbers: string[];
  debits: CurrencyMovementItem[];
  credits: CurrencyMovementItem[];
  balances: CurrencyMovementItem[];
}

interface FinancialAnalysis {
  id: string;
  fileName: string;
  originalFileName?: string;
  createdAt: string;
  transactions?: Transaction[];
  categoryData?: CategoryData[];
  dailyData?: DailyData[];
  movementsByCurrency?: CurrencyMovementsData[];
  icon: string;
  color: string;
}

// Componente para un elemento arrastrable
interface SortableAnalysisItemProps {
  analysis: FinancialAnalysis;
  index: number;
  onView: (analysis: FinancialAnalysis) => void;
  onEdit: (analysis: FinancialAnalysis) => void;
  onDelete: (id: string) => void;
}

// Componente para un elemento arrastrable (memoizado para evitar renderizados innecesarios)
const SortableAnalysisItem = memo(function SortableAnalysisItem({ analysis, onView, onEdit, onDelete }: SortableAnalysisItemProps) {
  // Memoizar las funciones de callback para evitar renderizados innecesarios
  const handleView = useMemo(() => () => onView(analysis), [analysis, onView]);
  const handleEdit = useMemo(() => () => onEdit(analysis), [analysis, onEdit]);
  const handleDelete = useMemo(() => () => onDelete(analysis.id), [analysis, onDelete]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
    id: analysis.id,
    transition: {
      duration: 150, // Reducir la duración de la transición para que se sienta más rápido
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)' // Curva de aceleración más rápida
    }
  });
  
  // Optimizar la transformación para que sea más ligera
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1 // Añadir transparencia durante el arrastre para feedback visual
  };
  
  // Usar las funciones del componente principal
  const getColorClassesForItem = (colorName: string) => {
    const colorOption = colorOptions.find(option => option.value === colorName);
    return {
      bg: colorOption?.bgClass || 'bg-blue-100',
      text: colorOption?.textClass || 'text-blue-600'
    };
  };
  
  const renderIconForItem = (iconName: string, colorClass: string) => {
    const IconComponent = iconOptions.find(option => option.value === iconName)?.icon || BarChart;
    return <IconComponent className={`h-6 w-6 ${colorClass}`} />;
  };
  
  const formatDateForItem = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };
  
  // Memoizar los valores calculados para evitar recálculos innecesarios
  const colorClasses = useMemo(() => getColorClassesForItem(analysis.color || 'blue'), [analysis.color]);
  const icon = useMemo(() => renderIconForItem(analysis.icon || 'BarChart', colorClasses.text), [analysis.icon, colorClasses.text]);
  const formattedDate = useMemo(() => formatDateForItem(analysis.createdAt), [analysis.createdAt]);
  
  // Simplificar la estructura del DOM para mejorar el rendimiento
  return (
    <div
      ref={setNodeRef}
      onClick={handleView}
      style={style}
      className={`bg-white rounded-xl cursor-pointer shadow-md p-4 sm:p-6 relative ${
        isDragging ? 'shadow-lg ring-2 ring-blue-300' : 'hover:shadow-lg hover:bg-blue-50'
      }`}
    >
      {!isDragging && (
        <div className="absolute inset-0 rounded-xl border-2 border-transparent group-hover:border-blue-200 pointer-events-none"></div>
      )}
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <div className="flex items-start w-full">
          <div 
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100 self-center mr-1"
            title="Arrastrar para reordenar"
          >
            <GripVertical className={`h-5 w-5 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
          </div>
          <div 
            className={`p-3 rounded-lg ${colorClasses.bg} mr-3`}
          >
            {icon}
          </div>
          <div className="cursor-pointer flex-1">
            <h3 className="text-lg font-medium text-gray-800">{analysis.fileName}</h3>
            <div className="mt-1 flex items-center text-sm text-gray-500">
              <FileText className="h-4 w-4 mr-1" />
              {analysis.originalFileName || 'Archivo sin nombre'}
            </div>
            <div className="mt-1 text-xs text-gray-400">
              Creado el {formattedDate}
            </div>
          </div>
        </div>
        <div className="flex flex-row sm:flex-row gap-2 w-full sm:w-auto mt-3 sm:mt-0 justify-end">
          <Button
            variant="outline"
            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex-1 sm:flex-none"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit();
            }}
          >
            <Edit className="h-4 w-4 mr-1" />
            <span className="sm:inline">Editar</span>
          </Button>
          <Button
            variant="outline"
            className="text-red-600 hover:text-red-800 hover:bg-red-50 flex-1 sm:flex-none"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            <span className="sm:inline">Eliminar</span>
          </Button>
        </div>
      </div>
    </div>
  );
});

export default function AnalysisHistoryPage() {
  const [analyses, setAnalyses] = useState<FinancialAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [analysisToDelete, setAnalysisToDelete] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [analysisToEdit, setAnalysisToEdit] = useState<FinancialAnalysis | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedIcon, setEditedIcon] = useState('BarChart');
  const [editedColor, setEditedColor] = useState('blue');
  
  const router = useRouter();
  const setExpenseData = useExpenseStore((state) => state.setExpenseData);
  const currentUserId = useAuthStore((state) => state.user?.id);
  
  // Configurar sensores para dnd-kit con opciones optimizadas
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Reducir la distancia de activación para que se sienta más responsivo
      activationConstraint: {
        distance: 5, // Reducir la distancia necesaria para iniciar el arrastre (por defecto es 10)
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Memoizar los IDs de los análisis para evitar recálculos innecesarios
  const analysisIds = useMemo(() => analyses.map(a => a.id), [analyses]);

  useEffect(() => {
    fetchAnalyses();
  }, []);

  const fetchAnalyses = async () => {
    try {
      setLoading(true);
      // Obtener análisis desde la API
      const response = await financialService.getFinancialHistory();
      
      if (response.success) {
        // Los datos ya vienen con el formato correcto desde el backend
        setAnalyses(response.data);
      } else {
        setError('Error al cargar el historial de análisis');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el historial de análisis');
    } finally {
      setLoading(false);
    }
  };

  const handleViewAnalysis = async (analysis: FinancialAnalysis) => {
    try {
      setLoading(true);
      
      // Obtener los datos completos del análisis desde la API
      const response = await financialService.getFinancialAnalysis(analysis.id);
      
      if (response.success) {
        try {
          // Verificar que los datos sean válidos
          if (!response.data.transactions || !Array.isArray(response.data.transactions) || 
              !response.data.categoryData || !Array.isArray(response.data.categoryData) ||
              !response.data.dailyData || !Array.isArray(response.data.dailyData)) {
            throw new Error('Datos de análisis incompletos o inválidos');
          }
          
          // Guardar los datos en el store
          setExpenseData({
            transactions: response.data.transactions || [],
            categoryData: response.data.categoryData || [],
            dailyData: response.data.dailyData || [],
            movementsByCurrency: response.data.movementsByCurrency || [],
          });

          if (currentUserId) {
            saveStoredExpenseSnapshot({
              transactions: response.data.transactions || [],
              categoryData: response.data.categoryData || [],
              dailyData: response.data.dailyData || [],
              movementsByCurrency: response.data.movementsByCurrency || [],
              userId: currentUserId,
              analysisId: analysis.id,
            });
          } else {
            clearStoredExpenseSnapshot();
          }
          
          // Redirigir a la página de gastos
          router.push('/expenses');
        } catch (parseError) {
          console.error('Error al procesar los datos del análisis:', parseError);
          
          // Limpiar datos del localStorage para evitar mostrar datos antiguos
          clearStoredExpenseSnapshot();
          
          // Limpiar los datos del store
          setExpenseData({
            transactions: [],
            categoryData: [],
            dailyData: [],
            movementsByCurrency: [],
          });
          
          // Redirigir a la página de gastos con un parámetro de error
          router.push(`/expenses?error=true&fileId=${analysis.id}`);
        }
      } else {
        setError('Error al cargar el análisis');
      }
    } catch (err) {
      console.error('Error al cargar el análisis:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar el análisis');
      
      // Limpiar datos del localStorage para evitar mostrar datos antiguos
      clearStoredExpenseSnapshot();
      
      // Limpiar los datos del store
      setExpenseData({
        transactions: [],
        categoryData: [],
        dailyData: [],
        movementsByCurrency: [],
      });
      
      // Esperar un momento para que el usuario vea el mensaje antes de redirigir
      setTimeout(() => {
        // Redirigir a la página de gastos con un parámetro de error
        router.push(`/expenses?error=true&fileId=${analysis.id}`);
      }, 2000);
    } finally {
      setLoading(false);
    }
  };




  const confirmDelete = async () => {
    if (!analysisToDelete) return;
    
    try {
      // Obtener el nombre del análisis que se va a eliminar
      const analysisName = analyses.find(a => a.id === analysisToDelete)?.fileName || 'Análisis';
      
      // Eliminar el análisis a través de la API
      const response = await financialService.deleteFinancialAnalysis(analysisToDelete);
      
      if (response.success) {
        // Actualizar estado local
        const updatedAnalyses = analyses.filter(analysis => analysis.id !== analysisToDelete);
        setAnalyses(updatedAnalyses);
        
        // Mostrar mensaje de éxito
        setSuccessMessage(`"${analysisName}" ha sido eliminado correctamente`);
        
        // Ocultar el mensaje después de 5 segundos
        setTimeout(() => {
          setSuccessMessage(null);
        }, 5000);
      } else {
        setError('Error al eliminar el análisis');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el análisis');
    } finally {
      setDeleteDialogOpen(false);
      setAnalysisToDelete(null);
    }
  };

  const confirmEdit = async () => {
    if (!analysisToEdit) return;
    
    try {
      // Actualizar el análisis a través de la API
      const response = await financialService.updateFinancialAnalysis(
        analysisToEdit.id,
        {
          name: editedName,
          icon: editedIcon,
          color: editedColor
        }
      );
      
      if (response.success) {
        // Actualizar estado local
        const updatedAnalyses = analyses.map(analysis => {
          if (analysis.id === analysisToEdit.id) {
            return {
              ...analysis,
              fileName: editedName,
              icon: editedIcon,
              color: editedColor
            };
          }
          return analysis;
        });
        
        setAnalyses(updatedAnalyses);
        
        // Mostrar mensaje de éxito
        setSuccessMessage(`"${editedName}" ha sido actualizado correctamente`);
        
        // Ocultar el mensaje después de 5 segundos
        setTimeout(() => {
          setSuccessMessage(null);
        }, 5000);
      } else {
        setError('Error al actualizar el análisis');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el análisis');
    } finally {
      setEditDialogOpen(false);
      setAnalysisToEdit(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  // Función para renderizar el icono correcto
  const renderIcon = (iconName: string, colorClass: string) => {
    const IconComponent = iconOptions.find(option => option.value === iconName)?.icon || BarChart;
    return <IconComponent className={`h-6 w-6 ${colorClass}`} />;
  };

  // Función para obtener las clases de color
  const getColorClasses = (colorName: string) => {
    const colorOption = colorOptions.find(option => option.value === colorName);
    return {
      bg: colorOption?.bgClass || 'bg-blue-100',
      text: colorOption?.textClass || 'text-blue-600'
    };
  };

  // Función para manejar el fin del arrastre
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;
    
    if (active.id !== over.id) {
      try {
        setAnalyses((items) => {
          const oldIndex = items.findIndex(item => item.id === active.id);
          const newIndex = items.findIndex(item => item.id === over.id);
          
          const newItems = arrayMove(items, oldIndex, newIndex);
          
          // Actualizar el orden en la base de datos de forma asíncrona
          const updateOrder = async () => {
            try {
              await financialService.updateAnalysisOrder(newItems.map(item => item.id));
              
              // Mostrar mensaje de éxito
              setSuccessMessage('El orden de los análisis ha sido actualizado');
              
              // Ocultar el mensaje después de 5 segundos
              setTimeout(() => {
                setSuccessMessage(null);
              }, 5000);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Error al actualizar el orden de los análisis');
            }
          };
          
          // Ejecutar la actualización sin bloquear la UI
          updateOrder();
          
          return newItems;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al reordenar los análisis');
      }
    }
  };

  return (
    <main className="min-h-screen p-4 sm:p-6 bg-gradient-to-b from-blue-50 to-indigo-50">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between flex-col md:flex-row items-center mb-6 sm:mb-8 gap-4 md:gap-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-center md:text-left text-gray-800">Historial de Análisis</h1>
          <Link href="/">
            <Button className="bg-blue-600 hover:bg-blue-700 w-full md:w-auto">
              Analizar Nuevo Extracto
            </Button>
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}
        
        {successMessage && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-lg text-gray-600">Cargando historial...</span>
          </div>
        ) : analyses.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-6 sm:p-8 text-center">
            <FileText className="h-12 sm:h-16 w-12 sm:w-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-medium text-gray-700 mb-2">No hay análisis en tu historial</h3>
            <p className="text-gray-500 mb-6">Comienza subiendo tu primer extracto bancario</p>
            <Link href="/">
              <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                Subir Extracto
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center text-blue-700">
              <GripVertical className="h-5 w-5 mr-2 flex-shrink-0" />
              <span>
                <strong>Consejo:</strong> Puedes arrastrar los análisis para reordenarlos según tus preferencias.
              </span>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              // Añadir opciones de rendimiento
              measuring={{
                droppable: {
                  strategy: MeasuringStrategy.Always
                }
              }}
            >
              <SortableContext
                items={analysisIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col-reverse gap-4">
                  {analyses.map((analysis, index) => (
                    <SortableAnalysisItem
                      key={analysis.id}
                      analysis={analysis}
                      index={index}
                      onView={handleViewAnalysis}
                      onEdit={() => {
                        setAnalysisToEdit(analysis);
                        setEditedName(analysis.fileName);
                        setEditedIcon(analysis.icon || 'BarChart');
                        setEditedColor(analysis.color || 'blue');
                        setEditDialogOpen(true);
                      }}
                      onDelete={() => {
                        setAnalysisToDelete(analysis.id);
                        setDeleteDialogOpen(true);
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
        
        {/* Diálogo de confirmación para eliminar */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará permanentemente el análisis. Para recuperarlo, deberás volver a realizar el análisis del extracto bancario.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="mt-2 sm:mt-0">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Diálogo para editar análisis */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setEditDialogOpen(false)} 
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              <span className="sr-only">Cerrar</span>
            </button>
            <DialogHeader>
              <DialogTitle className="text-xl">Editar análisis</DialogTitle>
              <DialogDescription>
                Personaliza el nombre, icono y color de tu análisis financiero.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-5 items-center gap-2 sm:gap-4">
                <Label htmlFor="name" className="sm:text-right font-medium">
                  Nombre
                </Label>
                <Input
                  id="name"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="col-span-1 sm:col-span-4"
                  placeholder="Nombre del análisis"
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-5 items-center gap-2 sm:gap-4">
                <Label className="sm:text-right font-medium">
                  Icono
                </Label>
                <div className="col-span-1 sm:col-span-4">
                  <Select value={editedIcon} onValueChange={setEditedIcon}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona un icono" />
                    </SelectTrigger>
                    <SelectContent>
                      {iconOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center">
                            <option.icon className="h-5 w-5 mr-2" />
                            {option.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-5 items-start gap-2 sm:gap-4">
                <Label className="sm:text-right font-medium pt-2">
                  Color
                </Label>
                <div className="col-span-1 sm:col-span-4">
                  <RadioGroup
                    value={editedColor}
                    onValueChange={setEditedColor}
                    className="flex flex-wrap gap-3"
                  >
                    {colorOptions.map((option) => (
                      <div key={option.value} className="flex items-center">
                        <RadioGroupItem
                          value={option.value}
                          id={`color-${option.value}`}
                          className="sr-only"
                        />
                        <Label
                          htmlFor={`color-${option.value}`}
                          className={`${option.bgClass} w-10 h-10 sm:w-12 sm:h-12 rounded-md cursor-pointer flex items-center justify-center border transition-all duration-200 ${
                            editedColor === option.value 
                              ? 'ring-2 ring-offset-2 ring-blue-500 border-transparent' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full ${option.dotClass}`}></div>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </div>
              
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-3 text-gray-700">Vista previa:</h4>
                <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex items-start space-x-4">
                    <div className={`p-3 rounded-lg ${getColorClasses(editedColor).bg}`}>
                      {renderIcon(editedIcon, getColorClasses(editedColor).text)}
                    </div>
                    <div>
                      <div className="font-medium text-gray-800 text-lg">{editedName || 'Nombre del análisis'}</div>
                      {analysisToEdit?.originalFileName && (
                        <div className="mt-1 flex items-center text-sm text-gray-500">
                          <FileText className="h-4 w-4 mr-1" />
                          {analysisToEdit.originalFileName}
                        </div>
                      )}
                      {analysisToEdit?.createdAt && (
                        <div className="mt-1 text-xs text-gray-400">
                          Creado el {formatDate(analysisToEdit.createdAt)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex justify-end md:space-x-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setEditDialogOpen(false)}
                className="border-gray-300 hover:bg-gray-50 hover:text-gray-800"
              >
                Cancelar
              </Button>
              <Button 
                onClick={confirmEdit} 
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Guardar cambios
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
} 
