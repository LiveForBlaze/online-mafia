import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';

import { type AdminLobbySummary } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog.js';
import { toast } from '@/components/ui/Toaster.js';
import { useDebouncedValue } from '@/lib/useDebouncedValue.js';
import { adminApi } from '@/features/admin/api/admin.api.js';

import { PAGE_SIZE, type LobbyStatusFilter } from './admin.types.js';

export function LobbiesTab() {
  const { t } = useTranslation();
  // Дефолтный фильтр — ACTIVE (открытые + в игре). Закрытые шумят и
  // не требуют действий, их прячем пока админ не запросит явно.
  const [statusFilter, setStatusFilter] = useState<LobbyStatusFilter>('ACTIVE');
  const [search, setSearch] = useState('');
  // Debounce: API запрос идёт через 300мс после последнего keystroke,
  // а не на каждый символ.
  const debouncedSearch = useDebouncedValue(search, 300);
  const [lobbies, setLobbies] = useState<AdminLobbySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // При смене фильтров — забываем offset, иначе вторая страница «висит»
  // от предыдущего фильтра.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi
      .listLobbies({
        status: statusFilter,
        search: debouncedSearch || undefined,
        offset: 0,
        limit: PAGE_SIZE,
      })
      .then((res) => {
        if (!cancelled) {
          setLobbies(res.lobbies);
          setTotal(res.total);
        }
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, debouncedSearch, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await adminApi.listLobbies({
        status: statusFilter,
        search: debouncedSearch || undefined,
        offset: lobbies.length,
        limit: PAGE_SIZE,
      });
      setLobbies((curr) => [...curr, ...res.lobbies]);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.lobbies.searchPlaceholder')}
          className="flex-1 min-w-[200px] rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LobbyStatusFilter)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="ACTIVE">{t('admin.lobbies.filterActive')}</option>
          <option value="WAITING">{t('admin.lobbies.filterWaiting')}</option>
          <option value="IN_GAME">{t('admin.lobbies.filterInGame')}</option>
          <option value="CLOSED">{t('admin.lobbies.filterClosed')}</option>
          <option value="ALL">{t('admin.lobbies.filterAll')}</option>
        </select>
      </div>

      <div className="text-xs text-muted">
        {t('admin.shownOf', { shown: lobbies.length, total })}
        {loading && <span className="ml-2">…</span>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-card-deep text-2xs uppercase tracking-[0.18em] text-muted">
            <tr>
              <th className="px-3 py-2 text-left">{t('admin.lobbies.col.name')}</th>
              <th className="px-3 py-2 text-left">{t('admin.lobbies.col.host')}</th>
              <th className="px-3 py-2 text-left">{t('admin.lobbies.col.status')}</th>
              <th className="px-3 py-2 text-left">{t('admin.lobbies.col.members')}</th>
              <th className="px-3 py-2 text-right">{t('admin.lobbies.col.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {lobbies.map((lobby) => (
              <LobbyRow key={lobby.id} lobby={lobby} onChanged={refresh} />
            ))}
            {!loading && lobbies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  {t('admin.lobbies.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lobbies.length < total && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('admin.loadingMore') : t('admin.loadMore')}
          </Button>
        </div>
      )}
    </section>
  );
}

function LobbyRow({ lobby, onChanged }: { lobby: AdminLobbySummary; onChanged: () => void }) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(lobby.name);
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  function cancelRename() {
    setRenaming(false);
    setDraftName(lobby.name);
  }

  async function commitRename() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === lobby.name) {
      cancelRename();
      return;
    }
    setBusy(true);
    try {
      await adminApi.renameLobby(lobby.id, { name: trimmed });
      setRenaming(false);
      toast.success(t('admin.lobbies.renamed'));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  async function performClose() {
    setConfirmClose(false);
    setBusy(true);
    try {
      await adminApi.closeLobby(lobby.id);
      toast.success(t('admin.lobbies.closed'));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td className="px-3 py-2">
        {renaming ? (
          // Явные кнопки save/cancel вместо onBlur=commit — клик мимо случайно
          // сохранял черновик. Enter сохраняет, Escape отменяет.
          <div className="flex items-center gap-1">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') cancelRename();
              }}
              autoFocus
              disabled={busy}
              maxLength={60}
              className="flex-1 min-w-0 rounded border border-accent bg-bg px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={commitRename}
              disabled={busy}
              aria-label={t('common.save')}
              className="shrink-0 rounded p-1 text-success hover:bg-success/10 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={cancelRename}
              disabled={busy}
              aria-label={t('common.cancel')}
              className="shrink-0 rounded p-1 text-muted hover:bg-bg disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="text-left hover:underline"
            title={t('admin.lobbies.renameHint')}
          >
            {lobby.name}
          </button>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="text-fg">{lobby.hostNickname}</div>
        <div className="text-xs text-muted">{lobby.hostEmail}</div>
      </td>
      <td className="px-3 py-2 uppercase text-xs tracking-wider">
        <StatusPill status={lobby.status} />
      </td>
      <td className="px-3 py-2">{lobby.memberCount}</td>
      <td className="px-3 py-2 text-right">
        {lobby.status === 'CLOSED' ? (
          <span className="text-muted text-xs">—</span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmClose(true)}
            disabled={busy}
            className="border-danger/40 text-danger hover:bg-danger/10"
          >
            {t('admin.lobbies.forceClose')}
          </Button>
        )}
        {/* Dialog положение в DOM здесь не важно — он fixed-positioned. Но в
            tbody non-tr ребёнок невалиден, поэтому держим внутри <td>. */}
        <ConfirmDialog
          open={confirmClose}
          title={t('admin.lobbies.confirmCloseTitle')}
          message={t('admin.lobbies.confirmClose', { name: lobby.name })}
          confirmLabel={t('admin.lobbies.forceClose')}
          onConfirm={performClose}
          onCancel={() => setConfirmClose(false)}
          destructive
          pending={busy}
        />
      </td>
    </tr>
  );
}

function StatusPill({ status }: { status: 'WAITING' | 'IN_GAME' | 'CLOSED' }) {
  const map: Record<typeof status, string> = {
    WAITING: 'text-success',
    IN_GAME: 'text-accent',
    CLOSED: 'text-muted',
  };
  return <span className={map[status]}>{status}</span>;
}
