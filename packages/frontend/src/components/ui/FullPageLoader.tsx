// Full-viewport loading screen. Used by AuthGuard while the session is
// hydrating and by route-level suspense boundaries. Shows the wordmark plus a
// spinner on the app background so there is no flash of empty page.

import { Spinner } from '@/components/ui/Spinner.js';

interface FullPageLoaderProps {
  label?: string;
}

export function FullPageLoader({ label }: FullPageLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg"
    >
      <span className="text-lg font-semibold tracking-tight text-fg">online-mafia</span>
      <Spinner size="lg" className="text-primary" />
      {label && <span className="text-sm text-muted">{label}</span>}
    </div>
  );
}
