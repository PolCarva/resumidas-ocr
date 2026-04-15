'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { AuthShell } from '@/components/auth/auth-shell';
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

    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    if (!acceptTerms) {
      setError('Debes aceptar los términos y condiciones para continuar');
      setLoading(false);
      return;
    }

    try {
      const userData = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
      };
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
    <AuthShell
      modeLabel="Crear cuenta"
      description="Creá tu cuenta para guardar resúmenes, volver a tus archivos y tener todo en el mismo lugar."
      footer={(
        <p>
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="auth-link">
            Iniciá sesión
          </Link>
        </p>
      )}
    >
      <div className="auth-form-block">
        {error && (
          <div className="auth-alert mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-[0.8rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Nombre
            </Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="Tu nombre"
              value={formData.name}
              onChange={handleChange}
              required
              className="auth-input w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-[0.8rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Correo electrónico
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="nombre@correo.com"
              value={formData.email}
              onChange={handleChange}
              required
              className="auth-input w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-[0.8rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Contraseña
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={8}
              className="auth-input w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-[0.8rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Repetir contraseña
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Repetí tu contraseña"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              minLength={8}
              className="auth-input w-full"
            />
          </div>

          <div className="auth-note">
            <div className="flex items-start gap-3">
              <Checkbox
                id="terms"
                checked={acceptTerms}
                onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                className="mt-1 h-5 w-5 rounded-[0.7rem] border-slate-300 bg-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]"
                required
              />
              <label
                htmlFor="terms"
                className="text-sm leading-6 text-slate-700"
              >
                Acepto los{' '}
                <Link href="/terms" className="auth-link" target="_blank" rel="noreferrer">
                  Términos y Condiciones
                </Link>{' '}
                y la{' '}
                <Link href="/privacy" className="auth-link" target="_blank" rel="noreferrer">
                  Política de Privacidad
                </Link>
                .
              </label>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-[1.1rem] bg-slate-950 text-[0.95rem] text-white shadow-[0_28px_44px_-24px_rgba(15,23,42,0.82)] hover:bg-slate-800 hover:shadow-[0_32px_50px_-24px_rgba(15,23,42,0.88)]"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando cuenta...
              </>
            ) : (
              'Crear cuenta'
            )}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
} 
