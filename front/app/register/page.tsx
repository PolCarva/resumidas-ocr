'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
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

    // Validar que las contraseñas coincidan
    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    // Validar que se hayan aceptado los términos y condiciones
    if (!acceptTerms) {
      setError('Debes aceptar los términos y condiciones para continuar');
      setLoading(false);
      return;
    }

    try {
      // Eliminar confirmPassword antes de enviar
      const {...userData } = formData;
      const data = await authService.register(userData);
      login(data.token, data.user);
      router.push('/expenses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar usuario');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-shell pb-10">
      <div className="page-section">
        <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="surface-card relative overflow-hidden p-6 sm:p-8">
            <div className="absolute -left-12 top-0 h-36 w-36 rounded-full bg-emerald-100/70 blur-3xl" />
            <div className="absolute -right-10 bottom-0 h-28 w-28 rounded-full bg-sky-100/65 blur-3xl" />

            <div className="relative">
              <span className="section-label">Nueva cuenta</span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Crea tu espacio para analizar gastos con más claridad.
              </h1>
              <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
                Mantén el mismo proceso de registro y consentimiento, con una experiencia visual más limpia para completar el formulario con menos fricción.
              </p>

              <div className="mt-8 grid gap-3">
                <div className="surface-card-soft p-4">
                  <p className="text-sm font-semibold text-slate-900">Biblioteca personal</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Guarda análisis, vuelve a consultarlos y renómbralos cuando lo necesites.</p>
                </div>
                <div className="surface-card-soft p-4">
                  <p className="text-sm font-semibold text-slate-900">Cifrado y control</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Tus datos se procesan con el mismo flujo actual y permanecen protegidos.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="surface-card p-6 sm:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Únete a la plataforma</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Crear Cuenta</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Regístrate con el mismo flujo actual, ahora con mejor jerarquía y ritmo visual.</p>
            </div>

            {error && (
              <div className="mt-6 rounded-[1.25rem] border border-red-200/80 bg-red-50/90 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre completo</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Tu nombre"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full"
                />
              </div>

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

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={8}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength={8}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="terms"
                    checked={acceptTerms}
                    onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                    className="mt-1"
                    required
                  />
                  <div className="grid gap-2 leading-none">
                    <label
                      htmlFor="terms"
                      className="text-sm font-medium leading-6 text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      He leído y acepto los{' '}
                      <Link href="/terms" className="font-medium text-sky-700 underline" target="_blank">
                        Términos y Condiciones
                      </Link>{' '}
                      y la{' '}
                      <Link href="/privacy" className="font-medium text-sky-700 underline" target="_blank">
                        Política de Privacidad
                      </Link>
                    </label>
                    <p className="text-xs leading-5 text-slate-500">
                      Al registrarte, aceptas que tus datos sean procesados según nuestra política de privacidad.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando cuenta...
                  </>
                ) : (
                  'Registrarse'
                )}
              </Button>
            </form>

            <div className="mt-6 border-t border-slate-200/80 pt-5 text-center">
              <p className="text-slate-600">
                ¿Ya tienes una cuenta?{' '}
                <Link href="/login" className="font-medium text-sky-700 hover:text-sky-800">
                  Iniciar sesión
                </Link>
              </p>
            </div>
            <p className="mt-4 text-xs leading-6 text-slate-500">
              Los datos de tu cuenta están encriptados y no son accesibles para terceros.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
} 
