"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ReactNode } from "react";
import { Navbar } from "@/components/navbar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const hideFooter = pathname === "/";

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-grow pt-4 sm:pt-6">
        {children}
      </main>
      {!hideFooter ? (
        <footer className="px-4 pb-6 pt-10 sm:px-6 sm:pb-8">
          <div className="page-section px-0">
            <div className="surface-card-soft flex flex-col gap-4 px-5 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="font-medium text-slate-900">Resumidas Cuentas</p>
                <p className="mt-1">© {new Date().getFullYear()} Todos los derechos reservados.</p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <p>
                  Desarrollado por{" "}
                  <Link
                    target="_blank"
                    href="https://linkedin.com/in/pablo-carvalho-gimenez"
                    className="font-medium text-slate-700 hover:text-sky-700"
                  >
                    Pablo Carvalho
                  </Link>
                </p>
                <p className="flex flex-wrap gap-3">
                  <Link href="/privacy" className="hover:text-sky-700">Política de Privacidad</Link>
                  <Link href="/terms" className="hover:text-sky-700">Términos de Servicio</Link>
                </p>
              </div>
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
