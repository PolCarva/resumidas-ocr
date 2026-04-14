import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  className?: string;
}

export function PageHeader({ title, description, className = '' }: PageHeaderProps) {
  return (
    <div className={`surface-card relative overflow-hidden p-6 sm:p-8 ${className}`}>
      <div className="absolute -right-10 top-0 h-28 w-28 rounded-full bg-sky-100/70 blur-3xl" />
      <div className="absolute -bottom-12 left-10 h-24 w-24 rounded-full bg-emerald-100/55 blur-3xl" />
      <div className="relative">
        <span className="section-label">Información importante</span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
        {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
