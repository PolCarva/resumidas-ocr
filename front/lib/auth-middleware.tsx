'use client';

import { useEffect, ReactNode, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

interface AuthMiddlewareProps {
  children: ReactNode;
}

const publicRoutes = ['/', '/login', '/register'];

export function AuthMiddleware({ children }: AuthMiddlewareProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Efecto para manejar la inicialización y guardar la ruta actual
  useEffect(() => {
    // Marcar como inicializado
    setIsInitialized(true);

    // Si el usuario está autenticado, guardar la ruta actual (excepto login/register)
    if (isAuthenticated && pathname !== '/login' && pathname !== '/register') {
      localStorage.setItem('lastRoute', pathname);
    }
  }, [isAuthenticated, pathname]);

  // Efecto para manejar redirecciones solo después de la inicialización
  useEffect(() => {
    if (!isInitialized) return;
    
    // Evitar redirecciones múltiples
    if (isRedirecting) return;

    // Si la ruta no es pública y el usuario no está autenticado, redirigir a login
    if (!publicRoutes.includes(pathname) && !isAuthenticated) {
      setIsRedirecting(true);
      router.push('/login');
      return;
    }

    // Si el usuario está autenticado y está en una ruta de autenticación, redirigir a la última ruta o a expenses
    if (isAuthenticated && (pathname === '/login' || pathname === '/register')) {
      setIsRedirecting(true);
      const lastRoute = localStorage.getItem('lastRoute');
      router.push(lastRoute || '/expenses');
      return;
    }
  }, [isAuthenticated, pathname, router, isInitialized, isRedirecting]);

  // No renderizar nada hasta que se complete la inicialización para evitar parpadeos
  if (!isInitialized) {
    return null;
  }

  return <>{children}</>;
} 