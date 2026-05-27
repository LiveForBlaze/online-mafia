// Full-screen takeover для юзеров с site_access ограничением.
// site_access — единственная restriction, при которой бэкенд отбивает уже
// /auth/me (403 banned_site_access). FE ловит ApiError в useCurrentUser и
// кладёт банер в auth store, чтобы здесь его показать вместо приложения.

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button.js';
import { authApi } from '@/features/auth/api/auth.api.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';

export function BannedScreen({ reason }: { reason: string | null }) {
  const { t } = useTranslation();
  const setBanned = useAuthStore((s) => s.setBanned);

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // Игнорим — даже если сетевой fail, локальный state мы всё равно
      // сбрасываем чтобы юзер вернулся на login без рефреша.
    }
    setBanned(null);
    window.location.assign('/login');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg px-4 text-center">
      <div className="max-w-md space-y-4">
        <div className="text-5xl">⛔</div>
        <h1 className="text-2xl font-bold text-fg">{t('banned.title')}</h1>
        <p className="text-muted">{t('banned.description')}</p>
        {reason && (
          <div className="rounded-md border border-border bg-card p-3 text-sm text-fg">
            <div className="text-xs uppercase tracking-wider text-muted mb-1">
              {t('banned.reasonLabel')}
            </div>
            <div>{reason}</div>
          </div>
        )}
        <Button variant="secondary" onClick={logout}>
          {t('banned.logout')}
        </Button>
      </div>
    </div>
  );
}
