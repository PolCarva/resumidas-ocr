import { UploadForm } from "@/components/upload-form"
import { generateMetadata } from "@/lib/hooks/useMetadata"

export const metadata = generateMetadata({
  title: "Resumidas Cuentas - Analiza tus finanzas personales",
  description: "Analiza y categoriza automáticamente tus gastos para tomar el control de tus finanzas personales. Visualiza tus patrones de gasto con gráficos interactivos.",
  keywords: [
    "categorización automática",
    "extractos bancarios",
    "control de gastos",
  ],
  path: "/",
});

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col overflow-x-hidden items-center justify-center p-4 md:px-10 bg-gradient-to-b from-blue-50 to-indigo-50">

      <div className="relative w-full max-w-4xl mx-auto text-center z-0 px-4 py-12">
        {/* Círculos decorativos con difuminado */}
        <div className="absolute top-8 w-96 h-96 -left-40 animate-blob bg-blue-200/20 rounded-full mix-blend-multiply filter blur-xl animate-blob" />
        <div className="absolute top-1/4 -right-40 w-64 h-64 animate-blob bg-indigo-200/20 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000" />
        <div className="absolute -bottom-40 left-1/2 transform -translate-x-1/2 w-64 h-64 bg-blue-200/20 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000" />

        <div className="relative">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 text-gray-800">
            Resumidas Cuentas
          </h1>
          <p className="text-xl text-gray-600 mb-6 max-w-2xl mx-auto">
            Analiza y categoriza automáticamente tus gastos con OCR para tomar el control de tus finanzas personales
          </p>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-8">
            <div className="rounded-xl flex gap-2 items-center">
              <span className="w-3 h-3 rounded-full bg-green-500 block mx-auto" />
              <span className="text-lg font-medium text-gray-700">Fácil de usar</span>
            </div>
            <div className="rounded-xl flex gap-2 items-center">
              <span className="w-3 h-3 rounded-full bg-blue-500 block mx-auto" />
              <span className="text-lg font-medium text-gray-700">Categorización automática</span>
            </div>
            <div className="rounded-xl flex gap-2 items-center">
              <span className="w-3 h-3 rounded-full bg-purple-500 block mx-auto" />
              <span className="text-lg font-medium text-gray-700">Gráficos interactivos</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl mx-auto mb-16">
        <UploadForm />
      </div>

    </main>
  )
}
