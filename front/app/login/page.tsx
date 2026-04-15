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
    <AuthShell
      modeLabel="Iniciar sesión"
      description="Entrá para seguir viendo tus análisis, tus categorías y tus archivos sin dar vueltas."
      footer={(
        <p>
          ¿No tenés cuenta?{' '}
          <Link href="/register" className="auth-link">
            Creala
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
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
              className="auth-input w-full"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-[1.1rem] bg-slate-950 text-[0.95rem] text-white shadow-[0_28px_44px_-24px_rgba(15,23,42,0.82)] hover:bg-slate-800 hover:shadow-[0_32px_50px_-24px_rgba(15,23,42,0.88)]"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
} 
