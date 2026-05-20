// Themed text input primitive. Used by FormField and any standalone input.

import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn.js';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = 'text', ...rest }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'h-10 w-full rounded-md border border-border bg-card px-3 text-base text-fg',
          'placeholder:text-muted',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...rest}
      />
    );
  },
);
