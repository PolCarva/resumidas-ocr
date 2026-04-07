import type { Viewport, Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { AuthMiddleware } from "@/lib/auth-middleware";
import { Navbar } from "@/components/navbar";
import { Toaster } from 'sonner'

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// Configuración del viewport
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#3b82f6",
};

// Metadatos por defecto para toda la aplicación
export const metadata: Metadata = {
  title: "Resumidas Cuentas - Finanzas Personales",
  description: "Analiza y categoriza automáticamente tus gastos para tomar el control de tus finanzas personales. Visualiza tus patrones de gasto con gráficos interactivos.",
  keywords: [
    "finanzas personales",
    "resumen de transacciones",
    "resumen de gastos",
    "itau",
    "santander",
    "bbva",
    "brou",
    "análisis de gastos",
    "categorización automática",
    "gestión financiera",
    "extractos bancarios",
    "visualización de datos",
    "control de gastos",
    "presupuesto personal",
  ],
  icons: {
    apple: [
      {
        url: "/apple-icon",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthMiddleware>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow">
              {children}
            </main>
            <footer className="py-6 bg-gray-50 border-t border-gray-100">
              <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
                <p>© {new Date().getFullYear()} Resumidas Cuentas. Todos los derechos reservados.</p>
                <p>Desarrollado con ❤️ por <Link target="_blank" href="https://linkedin.com/in/pablo-carvalho-gimenez" className="hover:text-blue-600 transition-colors">Pablo Carvalho</Link></p>
                <p className="mt-2">
                  <Link href="/privacy" className="hover:text-blue-600 transition-colors">Política de Privacidad</Link>
                  {" · "}
                  <Link href="/terms" className="hover:text-blue-600 transition-colors">Términos de Servicio</Link>
                </p>
              </div>
            </footer>
          </div>
        </AuthMiddleware>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
