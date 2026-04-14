import React from 'react';

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function Container({ children, className = '' }: ContainerProps) {
  return (
    <div className={`page-section max-w-5xl py-10 sm:py-12 ${className}`}>
      {children}
    </div>
  );
}
