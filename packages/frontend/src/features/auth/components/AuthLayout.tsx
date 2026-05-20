// Shared layout for login and register screens.
// Centers a narrow card in the viewport. Heading and body are passed by the consumer.

import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/ui/ThemeToggle.js';

interface AuthLayoutProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, children, footer }: AuthLayoutProps) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-bg relative">
      {/* Theme toggle floats in the top-right corner so it's discoverable on every
          auth screen without cluttering the form itself. */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-semibold text-fg text-center">{title}</h1>
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">{children}</div>
        {footer && <div className="mt-4 text-center text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}
