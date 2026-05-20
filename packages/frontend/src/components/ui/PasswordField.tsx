// FormField specialised for passwords — adds a "show/hide" eye toggle inside
// the input. Behaves like a regular FormField otherwise (same label + error
// shape) so it can drop in wherever a password field was used.

import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn.js';

import { Input } from './Input.js';
import { Label } from './Label.js';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, error, className, id, disabled, ...rest }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const [visible, setVisible] = useState(false);

    return (
      <div className={cn('w-full', className)}>
        <Label htmlFor={inputId}>{label}</Label>
        <div className="relative">
          <Input
            id={inputId}
            ref={ref}
            type={visible ? 'text' : 'password'}
            aria-invalid={Boolean(error)}
            disabled={disabled}
            className="pr-10"
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            disabled={disabled}
            tabIndex={-1}
            aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
            title={visible ? 'Скрыть пароль' : 'Показать пароль'}
            className={cn(
              'absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7',
              'items-center justify-center rounded-md text-muted hover:text-fg hover:bg-bg transition',
              'focus:outline-none focus:ring-2 focus:ring-accent',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
      </div>
    );
  },
);

const svgProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

function EyeIcon() {
  return (
    <svg {...svgProps}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...svgProps}>
      <path d="M17.94 17.94A10.5 10.5 0 0 1 12 19c-6.5 0-10-7-10-7a18.6 18.6 0 0 1 4.16-4.96" />
      <path d="M9.9 4.24A9.3 9.3 0 0 1 12 4c6.5 0 10 7 10 7a18.7 18.7 0 0 1-2.16 3.19" />
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
