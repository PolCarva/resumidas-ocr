'use client';

import { useEffect, ReactNode } from 'react';
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
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (isAuthenticated && pathname !== '/login' && pathname !== '/register') {
      localStorage.setItem('lastRoute', pathname);
    }
  }, [hasHydrated, isAuthenticated, pathname]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!publicRoutes.includes(pathname) && !isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (isAuthenticated && (pathname === '/login' || pathname === '/register')) {
      const lastRoute = localStorage.getItem('lastRoute');
      router.replace(lastRoute || '/expenses');
      return;
    }
  }, [hasHydrated, isAuthenticated, pathname, router]);

  if (!hasHydrated) {
    return null;
  }

  if (!publicRoutes.includes(pathname) && !isAuthenticated) {
    return null;
  }

  if (isAuthenticated && (pathname === '/login' || pathname === '/register')) {
    return null;
  }

  return <>{children}</>;
} 
