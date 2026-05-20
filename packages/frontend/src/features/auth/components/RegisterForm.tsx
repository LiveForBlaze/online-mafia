// Registration form: email, nickname, password.
// Validation rules are duplicated lightly on the client for UX (required, length hints),
// but the backend's zod schemas remain the source of truth.

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button.js';
import { FormField } from '@/components/ui/FormField.js';
import { extractAuthErrorMessage, useRegister } from '@/features/auth/hooks/useAuth.js';
import { AUTH_MESSAGES } from '@/features/auth/messages.js';

interface RegisterFormProps {
  onSuccess: () => void;
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const register = useRegister();

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
        label={AUTH_MESSAGES.register.emailLabel}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={register.isPending}
      />

      <div>
        <FormField
          label={AUTH_MESSAGES.register.nicknameLabel}
          type="text"
          autoComplete="username"
          required
          minLength={2}
          maxLength={24}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          disabled={register.isPending}
        />
        <p className="mt-1 text-xs text-muted">{AUTH_MESSAGES.register.nicknameHint}</p>
      </div>

      <div>
        <FormField
          label={AUTH_MESSAGES.register.passwordLabel}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={register.isPending}
        />
        <p className="mt-1 text-xs text-muted">{AUTH_MESSAGES.register.passwordHint}</p>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}

      <Button type="submit" size="md" className="w-full" disabled={register.isPending}>
        {register.isPending ? AUTH_MESSAGES.register.submitting : AUTH_MESSAGES.register.submit}
      </Button>
    </form>
  );
}
