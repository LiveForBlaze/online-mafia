// Login form. Submits email + password to the backend.
// Validation mirrors the backend zod schemas. Fields validate on blur and on
// submit (required + basic email shape) so the user gets per-field feedback
// before submitting; per-keystroke validation stays off to avoid noisy red
// borders while typing.

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button.js';
import { FormField } from '@/components/ui/FormField.js';
import { PasswordField } from '@/components/ui/PasswordField.js';
import { useExtractAuthErrorMessage, useLogin } from '@/features/auth/hooks/useAuth.js';

interface LoginFormProps {
  onSuccess: () => void;
}

type Field = 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const login = useLogin();
  const extractAuthErrorMessage = useExtractAuthErrorMessage();

  function validateField(
    field: Field,
    values: { email: string; password: string },
  ): string | undefined {
    if (field === 'email') {
      if (!values.email.trim()) return t('auth.validation.emailRequired');
      if (!EMAIL_RE.test(values.email.trim())) return t('auth.validation.emailInvalid');
    }
    if (field === 'password') {
      if (!values.password) return t('auth.validation.passwordRequired');
    }
    return undefined;
  }

  function runValidation(): FieldErrors {
    const values = { email, password };
    const next: FieldErrors = {};
    (['email', 'password'] as const).forEach((f) => {
      const msg = validateField(f, values);
      if (msg) next[f] = msg;
    });
    return next;
  }

  function handleBlur(field: Field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const msg = validateField(field, { email, password });
    setFieldErrors((prev) => ({ ...prev, [field]: msg }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = runValidation();
    setTouched({ email: true, password: true });
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    login.mutate(
      { email, password },
      {
        onSuccess: () => onSuccess(),
      },
    );
  }

  const errorMessage = login.isError ? extractAuthErrorMessage(login.error) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        label={t('auth.login.emailLabel')}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        onBlur={() => handleBlur('email')}
        error={touched.email ? fieldErrors.email : undefined}
        disabled={login.isPending}
      />

      <PasswordField
        label={t('auth.login.passwordLabel')}
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        onBlur={() => handleBlur('password')}
        error={touched.password ? fieldErrors.password : undefined}
        disabled={login.isPending}
      />

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      <Button type="submit" size="md" className="w-full" loading={login.isPending}>
        {login.isPending ? t('auth.login.submitting') : t('auth.login.submit')}
      </Button>
    </form>
  );
}
