// Registration form: email, nickname, password.
// Validation rules are duplicated lightly on the client for UX (required, length
// hints) so the user gets per-field feedback on blur and on submit, but the
// backend's zod schemas remain the source of truth.

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button.js';
import { FormField } from '@/components/ui/FormField.js';
import { PasswordField } from '@/components/ui/PasswordField.js';
import { useExtractAuthErrorMessage, useRegister } from '@/features/auth/hooks/useAuth.js';

interface RegisterFormProps {
  onSuccess: () => void;
}

type Field = 'email' | 'nickname' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const register = useRegister();
  const extractAuthErrorMessage = useExtractAuthErrorMessage();

  // Per-field validators. Each returns an i18n message or undefined when valid.
  function validateField(
    field: Field,
    values: { email: string; nickname: string; password: string },
  ): string | undefined {
    if (field === 'email') {
      if (!values.email.trim()) return t('auth.validation.emailRequired');
      if (!EMAIL_RE.test(values.email.trim())) return t('auth.validation.emailInvalid');
    }
    if (field === 'nickname') {
      const n = values.nickname.trim();
      if (!n) return t('auth.validation.nicknameRequired');
      if (n.length < 2) return t('auth.validation.nicknameTooShort');
      if (n.length > 24) return t('auth.validation.nicknameTooLong');
    }
    if (field === 'password') {
      if (!values.password) return t('auth.validation.passwordRequired');
      if (values.password.length < 8) return t('auth.validation.passwordTooShort');
    }
    return undefined;
  }

  function runValidation(): FieldErrors {
    const values = { email, nickname, password };
    const next: FieldErrors = {};
    (['email', 'nickname', 'password'] as const).forEach((f) => {
      const msg = validateField(f, values);
      if (msg) next[f] = msg;
    });
    return next;
  }

  function handleBlur(field: Field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const msg = validateField(field, { email, nickname, password });
    setFieldErrors((prev) => ({ ...prev, [field]: msg }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = runValidation();
    setTouched({ email: true, nickname: true, password: true });
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    register.mutate(
      { email, nickname, password },
      {
        onSuccess: () => onSuccess(),
      },
    );
  }

  const errorMessage = register.isError ? extractAuthErrorMessage(register.error) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        label={t('auth.register.emailLabel')}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        onBlur={() => handleBlur('email')}
        error={touched.email ? fieldErrors.email : undefined}
        disabled={register.isPending}
      />

      <div>
        <FormField
          label={t('auth.register.nicknameLabel')}
          type="text"
          autoComplete="username"
          required
          minLength={2}
          maxLength={24}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          onBlur={() => handleBlur('nickname')}
          error={touched.nickname ? fieldErrors.nickname : undefined}
          disabled={register.isPending}
        />
        <p className="mt-1 text-xs text-muted">{t('auth.register.nicknameHint')}</p>
      </div>

      <div>
        <PasswordField
          label={t('auth.register.passwordLabel')}
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onBlur={() => handleBlur('password')}
          error={touched.password ? fieldErrors.password : undefined}
          disabled={register.isPending}
        />
        <p className="mt-1 text-xs text-muted">{t('auth.register.passwordHint')}</p>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      <Button type="submit" size="md" className="w-full" loading={register.isPending}>
        {register.isPending ? t('auth.register.submitting') : t('auth.register.submit')}
      </Button>
    </form>
  );
}
