// Registration form: email, nickname, password.
// Validation rules are duplicated lightly on the client for UX (required, length hints),
// but the backend's zod schemas remain the source of truth.

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button.js';
import { FormField } from '@/components/ui/FormField.js';
import { PasswordField } from '@/components/ui/PasswordField.js';
import { useExtractAuthErrorMessage, useRegister } from '@/features/auth/hooks/useAuth.js';

interface RegisterFormProps {
  onSuccess: () => void;
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const register = useRegister();
  const extractAuthErrorMessage = useExtractAuthErrorMessage();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          disabled={register.isPending}
        />
        <p className="mt-1 text-xs text-muted">{t('auth.register.passwordHint')}</p>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      <Button type="submit" size="md" className="w-full" disabled={register.isPending}>
        {register.isPending ? t('auth.register.submitting') : t('auth.register.submit')}
      </Button>
    </form>
  );
}
