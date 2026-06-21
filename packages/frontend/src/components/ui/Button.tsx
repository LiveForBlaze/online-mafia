// A minimal, themed button primitive. Variants are kept small on purpose —
// add new ones only when there is a real need, not preemptively.

import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { Spinner } from '@/components/ui/Spinner.js';
import { cn } from '@/lib/cn.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // When true the button is disabled, marked aria-busy, and shows a spinner
  // in the leading icon slot while keeping its label.
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  // Primary CTA — the cherry brand red. This is the main call to action.
  primary: 'bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50',
  secondary: 'bg-card text-fg border border-border hover:bg-bg disabled:opacity-50',
  ghost: 'text-fg hover:bg-card disabled:opacity-50',
  // Destructive actions — kick, close, killshot, vote "ЗА".
  danger: 'bg-danger text-danger-fg hover:opacity-90 disabled:opacity-50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
  lg: 'h-12 px-6 text-lg',
};

const spinnerSize = { sm: 'sm', md: 'sm', lg: 'md' } as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    type = 'button',
    loading = false,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size={spinnerSize[size]} />}
      {children}
    </button>
  );
});
