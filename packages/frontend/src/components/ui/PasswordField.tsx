// FormField specialised for passwords — adds a "show/hide" eye toggle inside
// the input. Behaves like a regular FormField otherwise (same label + error
// shape) so it can drop in wherever a password field was used.

import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn.js';

import { Input } from './Input.js';
import { Label } from './Label.js';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, error, className, id, disabled, ...rest }, ref) {
    const { t } = useTranslation();
    const autoId = useId();
    const inputId = id ?? autoId;
    const [visible, setVisible] = useState(false);
    const toggleLabel = visible ? t('common.hidePassword') : t('common.showPassword');

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
            className="pr-11"
            {...rest}
          />
          {/* ≥44px hit area (h-11 w-11) for touch a11y; the small icon keeps
              the visual footprint tight and the absolute position means the
              enlarged target never shifts surrounding layout. */}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            disabled={disabled}
            tabIndex={-1}
            aria-label={toggleLabel}
            title={toggleLabel}
            className={cn(
              'absolute right-0 top-1/2 -translate-y-1/2 inline-flex h-11 w-11',
              'items-center justify-center rounded-md text-muted hover:text-fg transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-accent',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {visible ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
          </button>
        </div>
        {error && <p className="mt-1.5 text-sm text-danger-text">{error}</p>}
      </div>
    );
  },
);
