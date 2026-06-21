import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type AdminUserSummary } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { ErrorState } from '@/components/ui/ErrorState.js';
import { toast } from '@/components/ui/Toaster.js';
import { useDebouncedValue } from '@/lib/useDebouncedValue.js';
import { adminApi } from '@/features/admin/api/admin.api.js';

import { PAGE_SIZE } from './admin.types.js';
import { UserCard } from './AdminUserCard.js';

export function UsersTab() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  // Боты и удалённые аккаунты по умолчанию скрыты на бэке. Тут — toggle
  // включить ботов обратно для редких кейсов когда они нужны (debug,
  // ручная чистка).
  const [includeBots, setIncludeBots] = useState(false);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    adminApi
      .listUsers({
        search: debouncedSearch || undefined,
        includeBots,
        offset: 0,
        limit: PAGE_SIZE,
      })
      .then((res) => {
        if (!cancelled) {
          setUsers(res.users);
          setTotal(res.total);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          // Keep a persistent error panel (below) and surface a toast too, so
          // the list never silently falls through to the "no users" empty copy.
          setLoadError(true);
          toast.error(err instanceof Error ? err.message : 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, includeBots, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await adminApi.listUsers({
        search: debouncedSearch || undefined,
        includeBots,
        offset: users.length,
        limit: PAGE_SIZE,
      });
      setUsers((curr) => [...curr, ...res.users]);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.users.searchPlaceholder')}
          className="flex-1 min-w-[200px] rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={includeBots}
            onChange={(e) => setIncludeBots(e.target.checked)}
          />
          {t('admin.users.showBots')}
        </label>
      </div>

      <div className="text-xs text-muted">
        {t('admin.shownOf', { shown: users.length, total })}
        {loading && <span className="ml-2">…</span>}
      </div>

      {loadError && users.length === 0 ? (
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <UserCard key={u.id} user={u} onChanged={refresh} />
          ))}
          {!loading && !loadError && users.length === 0 && (
            <p className="text-center text-muted py-6">{t('admin.users.empty')}</p>
          )}
        </div>
      )}

      {users.length < total && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
            {loadingMore ? t('admin.loadingMore') : t('admin.loadMore')}
          </Button>
        </div>
      )}
    </section>
  );
}
