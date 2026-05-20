// "Sign in with Google" button.
//
// Clicking redirects the browser to the backend's /api/v1/auth/google endpoint, which in turn
// redirects to Google. After the user authorises, Google redirects back to the backend,
// which sets a session cookie and redirects to the frontend root.
//
// We do not handle this with fetch because the OAuth flow requires a top-level navigation.

import { Button } from '@/components/ui/Button.js';
import { authApi } from '@/features/auth/api/auth.api.js';
import { AUTH_MESSAGES } from '@/features/auth/messages.js';

export function GoogleSignInButton() {
  return (
    <Button
      variant="secondary"
      size="md"
      className="w-full"
      onClick={() => {
        window.location.assign(authApi.googleSignInUrl());
      }}
    >
      <GoogleIcon />
      <span>{AUTH_MESSAGES.google.button}</span>
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.1 3.5-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.1-4.1 1.1-3.2 0-5.9-2.1-6.8-5H1v3.1C3 21.5 7.2 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.2c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2V6.7H1C.4 8.3 0 10.1 0 12s.4 3.7 1 5.3l4.2-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5C17.9 1.2 15.2 0 12 0 7.2 0 3 2.5 1 6.7l4.2 3.1c1-2.9 3.7-5 6.8-5z"
      />
    </svg>
  );
}
