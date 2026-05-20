import { Link, useNavigate } from 'react-router';

import { AuthLayout } from '@/features/auth/components/AuthLayout.js';
import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton.js';
import { RegisterForm } from '@/features/auth/components/RegisterForm.js';
import { AUTH_MESSAGES } from '@/features/auth/messages.js';
import { ROUTE_PATH } from '@/routes/paths.js';

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <AuthLayout
      title={AUTH_MESSAGES.register.title}
      footer={
        <>
          {AUTH_MESSAGES.register.haveAccountPrompt}{' '}
          <Link to={ROUTE_PATH.LOGIN} className="text-accent hover:underline">
            {AUTH_MESSAGES.register.loginLink}
          </Link>
        </>
      }
    >
      <RegisterForm onSuccess={() => navigate(ROUTE_PATH.HOME)} />

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
