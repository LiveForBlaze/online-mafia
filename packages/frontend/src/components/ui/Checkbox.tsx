// Themed checkbox + label pair. Wraps a native input — no custom styling magic,
// the native focus and accessibility behaviour is the best one.

import { forwardRef, useId, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn.js';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="h-4 w-4 rounded border-border accent-accent focus:ring-2 focus:ring-accent"
        {...rest}
      />
      <label htmlFor={inputId} className="text-sm text-fg select-none">
        {label}
      </label>
    </div>
  );
});
