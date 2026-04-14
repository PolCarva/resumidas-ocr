'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { authService } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Menu, X, User, LogOut, FileText, BarChart } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // Si falla el logout del backend, igual limpiamos la sesión local.
    } finally {
      logout();
      setMobileMenuOpen(false);
    }
  };

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <nav className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <div className="page-section max-w-6xl px-0">
        <div className="surface-card-soft flex h-16 items-center justify-between px-4 sm:px-5">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_rgba(15,23,42,0.65)]">
                RC
              </span>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold tracking-tight text-slate-950">Resumidas Cuentas</p>
                <p className="text-xs text-slate-500">Análisis financiero asistido</p>
              </div>
            </Link>
            <div className="hidden sm:ml-4 sm:flex sm:items-center sm:gap-1">
              <Link
                href="/"
                className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  isActive('/')
                    ? 'bg-slate-950 text-white shadow-[0_14px_28px_-20px_rgba(15,23,42,0.7)]'
                    : 'text-slate-500 hover:bg-white hover:text-slate-950'
                }`}
              >
                Analizar
              </Link>
              {isAuthenticated && (
                <>
                  <Link
                    href="/expenses"
                    className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                      isActive('/expenses')
                        ? 'bg-slate-950 text-white shadow-[0_14px_28px_-20px_rgba(15,23,42,0.7)]'
                        : 'text-slate-500 hover:bg-white hover:text-slate-950'
                    }`}
                  >
                    Gastos
                  </Link>
                  <Link
                    href="/files"
                    className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                      isActive('/files')
                        ? 'bg-slate-950 text-white shadow-[0_14px_28px_-20px_rgba(15,23,42,0.7)]'
                        : 'text-slate-500 hover:bg-white hover:text-slate-950'
                    }`}
                  >
                    Archivos
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="hidden sm:flex sm:items-center">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <div className="hidden text-right lg:block">
                  <p className="text-sm font-medium text-slate-900">{user?.name || user?.email}</p>
                  <p className="text-xs text-slate-500">Sesión activa</p>
                </div>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  className="text-slate-700"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link href="/login">
                  <Button variant="outline" className="text-slate-700">
                    Iniciar sesión
                  </Button>
                </Link>
                <Link href="/register">
                  <Button>
                    Registrarse
                  </Button>
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center sm:hidden">
            <button
              onClick={toggleMobileMenu}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/80 bg-white/85 text-slate-500 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.32)] transition hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-400"
            >
              <span className="sr-only">Abrir menú principal</span>
              {mobileMenuOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="page-section mt-3 sm:hidden">
          <div className="surface-card-soft space-y-1 p-2">
            <Link
              href="/"
              className={`block rounded-2xl px-4 py-3 text-base font-medium transition-colors ${
                isActive('/')
                  ? 'bg-slate-950 text-white'
                  : 'text-slate-600 hover:bg-white hover:text-slate-950'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Analizar
            </Link>
            {isAuthenticated && (
              <>
                <Link
                  href="/expenses"
                  className={`block rounded-2xl px-4 py-3 text-base font-medium transition-colors ${
                    isActive('/expenses')
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-600 hover:bg-white hover:text-slate-950'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <div className="flex items-center">
                    <BarChart className="h-5 w-5 mr-2" />
                    Gastos
                  </div>
                </Link>
                <Link
                  href="/files"
                  className={`block rounded-2xl px-4 py-3 text-base font-medium transition-colors ${
                    isActive('/files')
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-600 hover:bg-white hover:text-slate-950'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <div className="flex items-center">
                    <FileText className="h-5 w-5 mr-2" />
                    Archivos
                  </div>
                </Link>
              </>
            )}
          </div>
          <div className="mt-3 surface-card-soft border-white/70 p-4">
            {isAuthenticated ? (
              <>
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <User className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="ml-3">
                    <div className="text-base font-medium text-slate-900">{user?.name || user?.email}</div>
                    <div className="text-sm font-medium text-slate-500">{user?.email}</div>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    onClick={handleLogout}
                    className="block w-full rounded-2xl px-4 py-3 text-left text-base font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-950"
                  >
                    <div className="flex items-center">
                      <LogOut className="h-5 w-5 mr-2" />
                      Cerrar sesión
                    </div>
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Link
                  href="/login"
                  className="block rounded-2xl px-4 py-3 text-base font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-950"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="block rounded-2xl bg-slate-950 px-4 py-3 text-base font-medium text-white shadow-[0_18px_36px_-24px_rgba(15,23,42,0.65)]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Registrarse
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
} 
