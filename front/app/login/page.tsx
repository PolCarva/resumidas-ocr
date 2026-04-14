'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await authService.login(formData);
      login(data.token, data.user);
      router.push('/expenses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell pb-10">
      <div className="page-section">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="surface-card relative overflow-hidden p-6 sm:p-8">
            <div className="absolute -left-12 top-0 h-36 w-36 rounded-full bg-sky-100/70 blur-3xl" />
            <div className="absolute -right-10 bottom-0 h-28 w-28 rounded-full bg-emerald-100/60 blur-3xl" />

            <div className="relative">
              <span className="section-label">Acceso seguro</span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Inicia sesión para continuar con tus análisis.
              </h1>
              <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
                Recupera tus extractos procesados, revisa categorías y mantén tu historial ordenado en un entorno visual más claro.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className="surface-card-soft p-4">
                  <p className="text-sm font-semibold text-slate-900">Historial listo</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Vuelve a abrir análisis anteriores sin cambiar el flujo que ya conoces.</p>
                </div>
                <div className="surface-card-soft p-4">
                  <p className="text-sm font-semibold text-slate-900">Lectura más clara</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Mejor jerarquía para entender estados, acciones y próximos pasos.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="surface-card p-6 sm:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Bienvenido de nuevo</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Iniciar sesión</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Accede con el mismo proceso de autenticación, ahora con una estructura visual más limpia.</p>
            </div>

            {error && (
              <div className="mt-6 rounded-[1.25rem] border border-red-200/80 bg-red-50/90 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="password">Contraseña</Label>
                  <Link href="#" className="text-sm font-medium text-sky-700 hover:text-sky-800">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="w-full"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  'Iniciar Sesión'
                )}
              </Button>
            </form>

            <div className="mt-6 border-t border-slate-200/80 pt-5 text-center">
              <p className="text-slate-600">
                ¿No tienes una cuenta?{' '}
                <Link href="/register" className="font-medium text-sky-700 hover:text-sky-800">
                  Regístrate
                </Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
} 
