// Admin panel: two tabs (lobbies / users). Owner-only route, fenced by
// useAuthStore.user.isAdmin in App.tsx + a 403 from the backend if anything
// slips through.
//
// Tab panels live in ../components (AdminLobbiesPanel, AdminUsersPanel,
// AdminUserCard) — this file is just the page shell + tab switcher.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';

import { cn } from '@/lib/cn.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { ROUTE_PATH } from '@/routes/paths.js';

import { LobbiesTab } from '../components/AdminLobbiesPanel.js';
import { UsersTab } from '../components/AdminUsersPanel.js';

type Tab = 'lobbies' | 'users';

export function AdminPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('lobbies');

  // На случай если кто-то открыл /admin прямой ссылкой не будучи админом —
  // редиректим на главную (бэк всё равно вернёт 403, но без редиректа
  // получим белую страницу с ошибкой).
  if (!user?.isAdmin) {
    return <Navigate to={ROUTE_PATH.HOME} replace />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-fg">{t('admin.title')}</h1>
        <p className="text-sm text-muted">{t('admin.subtitle')}</p>
      </header>

      <nav className="flex gap-1 border-b border-border">
        <TabButton active={tab === 'lobbies'} onClick={() => setTab('lobbies')}>
          {t('admin.tabs.lobbies')}
        </TabButton>
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
          {t('admin.tabs.users')}
        </TabButton>
      </nav>

      {tab === 'lobbies' ? <LobbiesTab /> : <UsersTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm transition-colors',
        active
          ? 'border-accent text-fg font-semibold'
          : 'border-transparent text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}
