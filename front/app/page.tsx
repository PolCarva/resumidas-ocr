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
    <section className="page-section flex h-full items-center justify-center py-3 sm:py-5">
      <div className="auth-scene overflow-visible w-full max-w-5xl px-1 py-5 sm:px-3 sm:py-7">
        <div className="auth-grid" />
        <div className="pointer-events-none absolute left-[6%] top-[8%] h-36 w-36 rounded-full bg-sky-300/35 blur-3xl sm:h-52 sm:w-52" />
        <div className="pointer-events-none absolute right-[8%] top-[12%] h-32 w-32 rounded-full bg-amber-200/40 blur-3xl sm:h-44 sm:w-44" />

        <section className="auth-panel mx-auto w-full max-w-3xl">
          <div className="relative z-10">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Analizar extracto
            </p>
            <h1 className="auth-display mt-5 text-[clamp(3rem,7vw,5rem)] text-slate-950">
              Resumidas cuentas
            </h1>
            <p className="mt-3 max-w-2xl text-[0.98rem] leading-7 text-slate-600">
              Subí tu PDF o imagen y convertí el extracto en un resumen claro, ordenado y listo para revisar.
            </p>

            <div className="mt-8">
              <UploadForm />
            </div>
          </div>
        </section>
      </div>
    </section>
  )
}
