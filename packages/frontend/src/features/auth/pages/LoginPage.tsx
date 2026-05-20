import { Link, useNavigate } from 'react-router';

import { AuthLayout } from '@/features/auth/components/AuthLayout.js';
import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton.js';
import { LoginForm } from '@/features/auth/components/LoginForm.js';
import { AUTH_MESSAGES } from '@/features/auth/messages.js';
import { ROUTE_PATH } from '@/routes/paths.js';

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <AuthLayout
      title={AUTH_MESSAGES.login.title}
      footer={
        <>
          {AUTH_MESSAGES.login.noAccountPrompt}{' '}
          <Link to={ROUTE_PATH.REGISTER} className="text-accent hover:underline">
            {AUTH_MESSAGES.login.registerLink}
          </Link>
        </>
      }
    >
      <LoginForm onSuccess={() => navigate(ROUTE_PATH.HOME)} />

      <Separator label={AUTH_MESSAGES.login.or} />

      <GoogleSignInButton />
    </AuthLayout>
  );
}

function Separator({ label }: { label: string }) {
  return (
    <div className="relative my-2">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-card px-2 text-xs uppercase tracking-wider text-muted">{label}</span>
      </div>
    </div>
  );
}
