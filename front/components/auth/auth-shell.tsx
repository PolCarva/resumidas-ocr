'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

interface AuthShellProps {
  modeLabel: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}

export function AuthShell({ modeLabel, description, footer, children }: AuthShellProps) {
  return (
    <div className="page-shell flex h-full flex-col">
      <section className="page-section flex flex-1 items-center justify-center py-3 sm:py-5">
        <div className="auth-scene overflow-visible w-full max-w-5xl px-1 py-5 sm:px-3 sm:py-7">
          <div className="auth-grid" />
          <div className="pointer-events-none absolute left-[6%] top-[8%] h-36 w-36 rounded-full bg-sky-300/35 blur-3xl sm:h-52 sm:w-52" />
          <div className="pointer-events-none absolute right-[8%] top-[12%] h-32 w-32 rounded-full bg-amber-200/40 blur-3xl sm:h-44 sm:w-44" />

          <section className="auth-panel mx-auto w-full max-w-xl">
            <div className="relative z-10">
              <Link href="/" className="auth-brand">
                <span className="auth-brand-mark" aria-hidden="true" />
                Volver al inicio
              </Link>

              <h1 className="auth-display mt-6 text-[clamp(3rem,7vw,5rem)] text-slate-950">
                Resumidas cuentas
              </h1>
              <p className="mt-4 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-slate-500">
                {modeLabel}
              </p>
              <p className="mt-3 max-w-md text-[0.98rem] leading-7 text-slate-600">
                {description}
              </p>

              <div className="mt-8">{children}</div>

              <div className="mt-6 border-t border-slate-900/10 pt-5 text-sm text-slate-600">
                {footer}
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
