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
    <main className="flex min-h-[calc(100vh-7rem)] items-center justify-center px-4 py-6 sm:px-6">
      <div className="w-full max-w-2xl">
        <UploadForm />
      </div>
    </main>
  )
}
