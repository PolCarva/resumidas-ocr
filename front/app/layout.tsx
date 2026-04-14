import type { Viewport, Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthMiddleware } from "@/lib/auth-middleware";
import { AppShell } from "@/components/app-shell";
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
          <AppShell>{children}</AppShell>
        </AuthMiddleware>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
