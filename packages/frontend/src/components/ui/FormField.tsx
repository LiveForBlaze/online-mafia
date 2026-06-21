// Convenience wrapper that pairs a Label, an Input, and an error message.
// Keeps form markup compact and consistent without hiding any flexibility:
// individual Label/Input components remain usable directly when needed.

import { forwardRef, type InputHTMLAttributes, useId } from 'react';

import { cn } from '@/lib/cn.js';

import { Input } from './Input.js';
import { Label } from './Label.js';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={cn('w-full', className)}>
      <Label htmlFor={inputId}>{label}</Label>
      <Input id={inputId} ref={ref} aria-invalid={Boolean(error)} {...rest} />
      {error && <p className="mt-1.5 text-sm text-danger-text">{error}</p>}
    </div>
  );
});
