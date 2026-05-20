// Login form. Submits email + password to the backend.
// Validation mirrors the backend zod schemas — fields display server-side errors
// only after the form is submitted; per-character validation is intentionally off
// to avoid noisy red borders while the user is still typing.

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button.js';
import { FormField } from '@/components/ui/FormField.js';
import { PasswordField } from '@/components/ui/PasswordField.js';
import { extractAuthErrorMessage, useLogin } from '@/features/auth/hooks/useAuth.js';
import { AUTH_MESSAGES } from '@/features/auth/messages.js';

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        label={AUTH_MESSAGES.login.emailLabel}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={login.isPending}
      />

      <PasswordField
        label={AUTH_MESSAGES.login.passwordLabel}
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={login.isPending}
      />

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      <Button type="submit" size="md" className="w-full" disabled={login.isPending}>
        {login.isPending ? AUTH_MESSAGES.login.submitting : AUTH_MESSAGES.login.submit}
      </Button>
    </form>
  );
}
