"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useDropzone } from "react-dropzone"
import { Upload, FileText, ArrowRight, Loader2, AlertCircle, Lock, Sparkles, FileDigit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import { useExpenseStore } from "@/store/expenses"
import { useAuthStore } from "@/store/auth"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { financialService } from '@/lib/api'
import { clearStoredExpenseSnapshot, saveStoredExpenseSnapshot } from '@/lib/expense-cache'
import {
  buildAnalysisFromOcrFreePayload,
  guessStatementDateToken,
  guessTitleFromOcrResult,
} from '@/lib/ocr-free-adapter'

// Estados del proceso de análisis
enum AnalysisState {
  IDLE = 'idle',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  ANALYZING = 'analyzing',
  SAVING = 'saving',
  COMPLETED = 'completed',
  ERROR = 'error'
}

const ANALYSIS_FEEDBACK_MESSAGES = [
  "Procesando transacciones...",
  "Identificando patrones de gasto...",
  "Categorizando movimientos...",
  "Analizando frecuencia de gastos...",
  "Calculando totales por categoría...",
  "Generando resumen de gastos...",
  "Preparando visualización de datos...",
  "Detectando transacciones recurrentes...",
  "Aplicando algoritmos de categorización...",
  "Esto puede tomar un momento para extractos grandes...",
  "Optimizando resultados...",
  "Casi listo...",
  "Buscando gastos innecesarios...",
  "Analizando tendencias de ahorro...",
  "Comparando con patrones anteriores...",
  "Identificando oportunidades de ahorro...",
  "Clasificando gastos por prioridad...",
  "Detectando suscripciones recurrentes...",
  "Calculando balance mensual...",
  "Analizando flujo de caja...",
  "Procesando datos bancarios...",
  "Aplicando inteligencia artificial...",
  "La IA está trabajando en tu análisis...",
  "Organizando tus finanzas...",
  "Preparando recomendaciones personalizadas..."
]


export function UploadForm() {
  const router = useRouter()
  const setExpenseData = useExpenseStore((state) => state.setExpenseData)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const currentUser = useAuthStore((state) => state.user)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisState, setAnalysisState] = useState<AnalysisState>(AnalysisState.IDLE)
  const [progress, setProgress] = useState(0)
  const [wasJsonRepaired, setWasJsonRepaired] = useState(false)
  const [modelInfo, setModelInfo] = useState<string | null>(null)
  const [analysisMessage, setAnalysisMessage] = useState<string>("")
  const [pagesInfo, setPagesInfo] = useState<{ processed: number, total: number } | null>(null)
  const analysisStateRef = useRef<AnalysisState>(AnalysisState.IDLE)
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const stopAnalysisFeedback = useCallback(() => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }
  }, [])

  // Función para iniciar los mensajes de feedback durante el análisis
  const startAnalysisFeedback = useCallback(() => {
    stopAnalysisFeedback()

    let messageIndex = 0
    setProgress(35)

    const showNextMessage = () => {
      if (analysisStateRef.current !== AnalysisState.ANALYZING) {
        stopAnalysisFeedback()
        return
      }

      setAnalysisMessage(ANALYSIS_FEEDBACK_MESSAGES[messageIndex])
      messageIndex = (messageIndex + 1) % ANALYSIS_FEEDBACK_MESSAGES.length

      setProgress((prev) => {
        const increment = 4 + Math.random() * 2
        const newProgress = prev + increment
        return Math.min(89, newProgress)
      })

      const nextUpdateTime = 5000 + Math.random() * 5000
      feedbackTimeoutRef.current = setTimeout(showNextMessage, nextUpdateTime)
    }

    showNextMessage()
  }, [stopAnalysisFeedback])

  useEffect(() => {
    analysisStateRef.current = analysisState
  }, [analysisState])

  // Actualizar el progreso basado en el estado
  useEffect(() => {
    switch (analysisState) {
      case AnalysisState.IDLE:
        stopAnalysisFeedback()
        setProgress(0)
        setAnalysisMessage("")
        setPagesInfo(null)
        break
      case AnalysisState.UPLOADING:
        stopAnalysisFeedback()
        setProgress(10)
        setAnalysisMessage("")
        break
      case AnalysisState.PROCESSING:
        stopAnalysisFeedback()
        setProgress(20)
        setAnalysisMessage("")
        break
      case AnalysisState.ANALYZING:
        startAnalysisFeedback()
        break
      case AnalysisState.SAVING:
        stopAnalysisFeedback()
        setProgress(90)
        setAnalysisMessage("")
        break
      case AnalysisState.COMPLETED:
        stopAnalysisFeedback()
        setProgress(100)
        setAnalysisMessage("")
        break
      case AnalysisState.ERROR:
        stopAnalysisFeedback()
        setProgress(0)
        setAnalysisMessage("")
        break
    }
  }, [analysisState, startAnalysisFeedback, stopAnalysisFeedback])

  useEffect(() => {
    return () => {
      stopAnalysisFeedback()
    }
  }, [stopAnalysisFeedback])

  // Redirigir a la página de archivos después de completar el análisis
  useEffect(() => {
    if (analysisState === AnalysisState.COMPLETED) {
      // Asegurarse de que el progreso esté al 100%
      setProgress(100);
      
      // Esperar 0.5 segundos antes de redirigir para que el usuario vea el 100%
      const timer = setTimeout(() => {
        router.push('/expenses')
      }, 500) // 500ms = 0.5 segundos
      
      return () => clearTimeout(timer)
    } else if (analysisState === AnalysisState.ERROR) {
      // Si hay un error, limpiar datos del localStorage pero NO redirigir
      const timer = setTimeout(() => {
        clearStoredExpenseSnapshot()

        // Ya no redirigimos a /expenses cuando hay un error
        // El usuario puede intentar de nuevo o navegar manualmente
      }, 1000)
      
      return () => clearTimeout(timer)
    }
  }, [analysisState, router])

  const isSupportedStatementFile = useCallback((selectedFile: File): boolean => {
    const fileName = selectedFile.name.toLowerCase()
    return (
      selectedFile.type === "application/pdf" ||
      selectedFile.type.startsWith("image/") ||
      fileName.endsWith(".pdf") ||
      fileName.endsWith(".png") ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg") ||
      fileName.endsWith(".webp")
    )
  }, [])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    // No permitir cambiar el archivo durante el análisis
    if (loading) return

    setError(null)
    const selectedFile = acceptedFiles[0]

    if (selectedFile && isSupportedStatementFile(selectedFile)) {
      setFile(selectedFile)
    } else {
      setError("Por favor, sube un archivo PDF o una imagen válida")
    }
  }, [loading, isSupportedStatementFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
    maxFiles: 1,
    disabled: loading || !isAuthenticated // Deshabilitar si está cargando o no está autenticado
  })

  const handleSubmit = async () => {
    if (!file || loading || !isAuthenticated) return

    setLoading(true)
    setError(null)
    setWasJsonRepaired(false)
    setModelInfo(null)
    setPagesInfo(null)
    setAnalysisState(AnalysisState.UPLOADING)

    try {
      setAnalysisState(AnalysisState.PROCESSING)
      setAnalysisState(AnalysisState.ANALYZING)
      const ocrData = await financialService.runOcr(file)
      const categorizedData = await financialService.categorizeStructuredData(
        Array.isArray(ocrData.structured_data) ? ocrData.structured_data : []
      )

      setAnalysisState(AnalysisState.SAVING)
      const analysisName = guessTitleFromOcrResult(ocrData)
      const saveResponse = await financialService.saveAnalysis({
        title: analysisName,
        statementDate: guessStatementDateToken(ocrData),
        ocrResult: ocrData,
        categorizedResult: categorizedData,
      })

      const adaptedAnalysis = buildAnalysisFromOcrFreePayload({
        analysisId: saveResponse.data.id,
        payload: {
          ocr_result: ocrData,
          categorized_result: categorizedData,
        },
        title: saveResponse.data.title || analysisName,
      })

      setModelInfo('OCR Free')
      setWasJsonRepaired(false)

      const allTransactions = adaptedAnalysis.transactions
      const allCategoryData = adaptedAnalysis.categoryData
      const allDailyData = adaptedAnalysis.dailyData
      const allMovementsByCurrency = adaptedAnalysis.movementsByCurrency

      if (allTransactions.length === 0) {
        setAnalysisState(AnalysisState.ERROR)
        throw new Error('No se encontraron débitos o gastos válidos en el archivo')
      }

      // Guardar los datos en el store
      setExpenseData({
        transactions: allTransactions,
        categoryData: allCategoryData,
        dailyData: allDailyData,
        movementsByCurrency: allMovementsByCurrency,
      })

      // Persistir en localStorage para que /expenses renderice de inmediato.
      if (currentUser) {
        saveStoredExpenseSnapshot({
          transactions: allTransactions,
          categoryData: allCategoryData,
          dailyData: allDailyData,
          movementsByCurrency: allMovementsByCurrency,
          userId: currentUser.id,
          analysisId: String(saveResponse.data.id),
        })
      }

      // Marcar como completado y asegurar que el progreso esté al 100%
      setProgress(100);
      setAnalysisMessage("¡Análisis completado con éxito!");
      setAnalysisState(AnalysisState.COMPLETED)

      // La redirección se maneja en el useEffect
    } catch (err) {
      console.error('Error completo:', err)
      setError(err instanceof Error ? err.message : 'Error al procesar el archivo')
      setAnalysisState(AnalysisState.ERROR)

      // Limpiar los datos del store para evitar que se muestren datos antiguos
      setExpenseData({
        transactions: [],
        categoryData: [],
        dailyData: [],
        movementsByCurrency: [],
      })
    } finally {
      setLoading(false)
    }
  }

  // Obtener el mensaje de estado actual
  const getStatusMessage = () => {
    // Si estamos analizando y tenemos un mensaje específico, mostrarlo
    if (analysisState === AnalysisState.ANALYZING && analysisMessage) {
      return analysisMessage;
    }
    
    // Si estamos en estado completado y tenemos un mensaje, mostrarlo
    if (analysisState === AnalysisState.COMPLETED && analysisMessage) {
      return analysisMessage;
    }
    
    switch (analysisState) {
      case AnalysisState.UPLOADING:
        return "Subiendo archivo..."
      case AnalysisState.PROCESSING:
        return "Preparando archivo..."
      case AnalysisState.ANALYZING:
        return pagesInfo 
          ? `Analizando página ${pagesInfo.processed} de ${pagesInfo.total}...` 
          : "Analizando transacciones..."
      case AnalysisState.SAVING:
        return "Guardando análisis..."
      case AnalysisState.COMPLETED:
        return "¡Análisis completado!"
      case AnalysisState.ERROR:
        return "Error en el análisis"
      default:
        return "Preparando análisis..."
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <div className="space-y-4">
        {!isAuthenticated && (
          <Alert>
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Debes iniciar sesión para analizar extractos bancarios.{" "}
              <Button
                variant="link"
                className="h-auto p-0 font-semibold text-amber-800 underline"
                onClick={() => router.push('/login')}
              >
                Iniciar sesión
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              Hubo un error al procesar el archivo.
              {error.includes('demasiado grande') || error.includes('demasiado largo') ? (
                <div className="mt-2 text-sm">
                  <p>Sugerencias:</p>
                  <ul className="mt-1 list-disc pl-5">
                    <li>Intenta con un archivo más pequeño</li>
                    <li>Reduce páginas si es PDF</li>
                    <li>Usa una imagen más nítida</li>
                  </ul>
                </div>
              ) : null}
              {analysisState === AnalysisState.ERROR ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setError(null)
                      setAnalysisState(AnalysisState.IDLE)
                      setFile(null)
                    }}
                  >
                    Intentar de nuevo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/files')}
                  >
                    Ver mis archivos
                  </Button>
                </div>
              ) : null}
            </AlertDescription>
          </Alert>
        )}

        {wasJsonRepaired && !error ? (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Se reparó automáticamente el formato de la respuesta.
            </AlertDescription>
          </Alert>
        ) : null}

        {modelInfo && !error ? (
          <Alert>
            <Sparkles className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              Análisis realizado con <span className="font-semibold">{modelInfo}</span>.
            </AlertDescription>
          </Alert>
        ) : null}

        {pagesInfo && !error && analysisState !== AnalysisState.COMPLETED ? (
          <Alert>
            <FileDigit className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              Página {pagesInfo.processed} de {pagesInfo.total}.
            </AlertDescription>
          </Alert>
        ) : null}

        <div
          {...getRootProps()}
          className={`
            group relative overflow-hidden rounded-[2rem] border p-10 text-center transition-all duration-300 sm:p-12
            ${!isAuthenticated ? 'pointer-events-none opacity-60' : ''}
            ${isDragActive && isAuthenticated
              ? "border-sky-400 bg-[linear-gradient(135deg,rgba(219,234,254,0.92),rgba(239,246,255,0.98))] shadow-[0_28px_60px_-34px_rgba(14,165,233,0.35)]"
              : "border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.92))] shadow-[0_28px_70px_-42px_rgba(15,23,42,0.42)]"
            }
          `}
        >
          <input {...getInputProps()} />
          <div className="absolute inset-0 bg-grid-soft opacity-60" />

          {!isAuthenticated ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/70 backdrop-blur-sm">
              <div className="flex flex-col items-center">
                <Lock className="mb-2 h-8 w-8 text-slate-500" />
                <p className="font-medium text-slate-700">Inicia sesión para subir archivos</p>
              </div>
            </div>
          ) : null}

          {isDragActive && isAuthenticated ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative flex flex-col items-center"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <Upload className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-sky-800">Suelta el archivo</h2>
            </motion.div>
          ) : (
            <div className="relative flex flex-col items-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition group-hover:bg-slate-950 group-hover:text-white">
                <Upload className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Sube tu extracto</h2>
              <p className="mt-2 text-sm text-slate-500">PDF o imagen</p>
              {file ? (
                <div className="mt-5 flex items-center justify-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700">
                  <FileText className="h-4 w-4" />
                  {file.name}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {loading ? (
          <div className="surface-card-soft space-y-3 p-4">
            <div className="flex items-center justify-between">
              <motion.div
                key={analysisMessage || getStatusMessage()}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-2 text-sm font-medium text-slate-700"
              >
                {analysisState === AnalysisState.ANALYZING ? (
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Sparkles className="h-4 w-4 text-sky-500" />
                  </motion.div>
                ) : null}
                {analysisState === AnalysisState.COMPLETED ? (
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                ) : null}
                {getStatusMessage()}
              </motion.div>
              <span className="text-sm font-medium text-slate-700">{progress.toFixed(0)}%</span>
            </div>
            <Progress value={progress} className={analysisState === AnalysisState.COMPLETED ? 'bg-green-100' : ''} />
          </div>
        ) : null}

        <Button
          onClick={handleSubmit}
          disabled={!file || loading || !isAuthenticated}
          className={`
            w-full py-6 text-lg font-medium
            ${!file || !isAuthenticated
              ? "bg-slate-200 text-slate-500"
              : analysisState === AnalysisState.COMPLETED
                ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700"
                : "bg-gradient-to-r from-slate-950 via-slate-900 to-sky-700 text-white hover:from-slate-900 hover:to-sky-800"
            }
          `}
        >
          {loading ? (
            <motion.div
              className="flex items-center"
              animate={{ opacity: analysisState === AnalysisState.COMPLETED ? 1 : [0.8, 1, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              {analysisState === AnalysisState.COMPLETED ? (
                <>
                  <Sparkles className="mr-2 h-5 w-5 text-white" />
                  Completado
                </>
              ) : (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analizando...
                </>
              )}
            </motion.div>
          ) : (
            <>
              Analizar Gastos
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  )
}
