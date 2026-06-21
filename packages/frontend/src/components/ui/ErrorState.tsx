// Presentational error panel for failed data loads. Purely visual — it holds
// no query logic; the caller wires `onRetry` to its refetch.
//
// IMPORTANT: never pass a raw `error.message` here. The default copy is a
// generic, i18n-friendly line; surface technical details to logs, not users.

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';

interface ErrorStateProps {
  title?: string;
  // A generic, user-safe message. Defaults to safe copy — do NOT pass raw
  // exception text.
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
  icon?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this right now. Please try again.',
  retryLabel = 'Retry',
  onRetry,
  icon,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 py-10 text-center',
        className,
      )}
    >
      {icon}
      <h2 className="text-base font-semibold text-danger-text">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
