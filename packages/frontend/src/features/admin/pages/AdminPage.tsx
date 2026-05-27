// Admin panel: two tabs (lobbies / users). Owner-only route, fenced by
// useAuthStore.user.isAdmin in App.tsx + a 403 from the backend if anything
// slips through.
//
// Kept as a single file because:
//   - small surface (4 table-style screens),
//   - no other code in the codebase imports admin internals,
//   - splitting into sub-components prematurely would just spread boilerplate.

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { Check, ChevronDown, X } from 'lucide-react';

import {
  BAN_RESTRICTION,
  ALL_BAN_RESTRICTIONS,
  type AdminLobbySummary,
  type AdminUserSummary,
  type BanRestrictionCode,
} from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog.js';
import { toast } from '@/components/ui/Toaster.js';
import { cn } from '@/lib/cn.js';
import { useDebouncedValue } from '@/lib/useDebouncedValue.js';
import { ApiError } from '@/lib/api-client.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { adminApi } from '@/features/admin/api/admin.api.js';
import { ROUTE_PATH } from '@/routes/paths.js';

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

// ---------- Lobbies tab ----------

type LobbyStatusFilter = 'ACTIVE' | 'ALL' | 'WAITING' | 'IN_GAME' | 'CLOSED';

const PAGE_SIZE = 50;

function LobbiesTab() {
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
          <thead className="bg-card-deep text-[10px] uppercase tracking-[0.18em] text-muted">
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

// ---------- Users tab ----------

function UsersTab() {
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
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'error');
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

      <div className="space-y-3">
        {users.map((u) => (
          <UserCard key={u.id} user={u} onChanged={refresh} />
        ))}
        {!loading && users.length === 0 && (
          <p className="text-center text-muted py-6">{t('admin.users.empty')}</p>
        )}
      </div>

      {users.length < total && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? t('admin.loadingMore') : t('admin.loadMore')}
          </Button>
        </div>
      )}
    </section>
  );
}

function UserCard({ user, onChanged }: { user: AdminUserSummary; onChanged: () => void }) {
  const { t } = useTranslation();
  // По умолчанию свёрнуто — список юзеров часто длинный, разворачиваем
  // только когда админ реально работает с конкретным аккаунтом.
  const [expanded, setExpanded] = useState(false);
  const [restrictions, setRestrictions] = useState<BanRestrictionCode[]>(
    user.banRestrictions as BanRestrictionCode[],
  );
  const [reason, setReason] = useState(user.banReason ?? '');
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(user.nickname);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // При перезагрузке данных снаружи (refresh) — синкаемся.
  useEffect(() => {
    setRestrictions(user.banRestrictions as BanRestrictionCode[]);
    setReason(user.banReason ?? '');
    setDraftName(user.nickname);
  }, [user.banRestrictions, user.banReason, user.nickname]);

  const isDirty = useMemo(() => {
    const oldSet = new Set(user.banRestrictions);
    const newSet = new Set(restrictions);
    if (oldSet.size !== newSet.size) return true;
    for (const v of newSet) if (!oldSet.has(v)) return true;
    if ((user.banReason ?? '') !== reason) return true;
    return false;
  }, [user.banRestrictions, user.banReason, restrictions, reason]);

  const hasBan = user.banRestrictions.length > 0;
  const hasSiteBan = user.banRestrictions.includes(BAN_RESTRICTION.SITE_ACCESS);

  function toggle(code: BanRestrictionCode) {
    setRestrictions((curr) =>
      curr.includes(code) ? curr.filter((c) => c !== code) : [...curr, code],
    );
  }

  function applyAll() {
    setRestrictions([
      BAN_RESTRICTION.CREATE_LOBBY,
      BAN_RESTRICTION.PARTICIPATE_GAMES,
      BAN_RESTRICTION.VIEW_GAMES,
      BAN_RESTRICTION.EDIT_PROFILE,
    ]);
  }

  function clearAll() {
    setRestrictions([]);
    setReason('');
  }

  async function commitRestrictions() {
    setBusy(true);
    try {
      await adminApi.setRestrictions(user.id, restrictions, reason || null);
      toast.success(t('admin.users.restrictionsApplied'));
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function cancelRename() {
    setEditingName(false);
    setDraftName(user.nickname);
  }

  async function commitRename() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === user.nickname) {
      cancelRename();
      return;
    }
    setBusy(true);
    try {
      await adminApi.renameUser(user.id, { nickname: trimmed });
      setEditingName(false);
      toast.success(t('admin.users.renamed'));
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function performDelete() {
    setConfirmDelete(false);
    setBusy(true);
    try {
      await adminApi.deleteUser(user.id);
      toast.success(t('admin.users.deleted'));
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Свёрнутая строка-кликабель. Клик по любой части ряда раскрывает
          панель действий. Иконка-чеврон вращается на 180° когда expanded. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
          'hover:bg-bg/40 focus:outline-none focus:bg-bg/40',
        )}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-fg truncate">{user.nickname}</span>
            {user.isAdmin && (
              <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent">
                admin
              </span>
            )}
            {user.isBot && (
              <span className="rounded bg-muted/20 px-1.5 py-0.5 text-[10px] uppercase text-muted">
                bot
              </span>
            )}
            {hasSiteBan ? (
              <span className="rounded bg-danger/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-danger">
                {t('admin.users.statusBlocked')}
              </span>
            ) : hasBan ? (
              <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning">
                {t('admin.users.statusRestricted', { count: user.banRestrictions.length })}
              </span>
            ) : null}
          </div>
          <div className="text-xs text-muted truncate">
            {user.email} · #{user.publicCode}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          {/* Никнейм-редактор + delete справа. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {editingName ? (
              // Явные save/cancel вместо onBlur=commit.
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
                  maxLength={30}
                  className="rounded border border-accent bg-bg px-2 py-1 text-sm font-semibold"
                />
                <button
                  type="button"
                  onClick={commitRename}
                  disabled={busy}
                  aria-label={t('common.save')}
                  className="rounded p-1 text-success hover:bg-success/10 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={cancelRename}
                  disabled={busy}
                  aria-label={t('common.cancel')}
                  className="rounded p-1 text-muted hover:bg-bg disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-sm text-muted hover:text-fg hover:underline"
                title={t('admin.users.renameHint')}
              >
                ✎ {t('admin.users.renameAction')}
              </button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={busy || user.isAdmin}
              className="border-danger/40 text-danger hover:bg-danger/10"
            >
              {t('admin.users.delete')}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted">
              {t('admin.users.restrictionsLabel')}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {ALL_BAN_RESTRICTIONS.map((code) => (
                <label
                  key={code}
                  className={cn(
                    'flex items-start gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors',
                    restrictions.includes(code)
                      ? 'border-danger/60 bg-danger/5'
                      : 'border-border hover:bg-bg',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={restrictions.includes(code)}
                    onChange={() => toggle(code)}
                    className="mt-0.5"
                  />
                  <span>
                    <div className="font-medium text-fg">
                      {t(`admin.users.restrictions.${code}`)}
                    </div>
                    <div className="text-xs text-muted">
                      {t(`admin.users.restrictionsDesc.${code}`)}
                    </div>
                  </span>
                </label>
              ))}
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-muted">
                {t('admin.users.reasonLabel')}
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={280}
                placeholder={t('admin.users.reasonPlaceholder')}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={commitRestrictions}
                disabled={busy || !isDirty}
              >
                {t('admin.users.apply')}
              </Button>
              <Button variant="secondary" size="sm" onClick={applyAll} disabled={busy}>
                {t('admin.users.applyAll')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={clearAll}
                disabled={busy || restrictions.length === 0}
              >
                {t('admin.users.unban')}
              </Button>
            </div>

            {user.bannedAt && (
              <div className="text-xs text-muted">
                {t('admin.users.bannedAt')}: {new Date(user.bannedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t('admin.users.confirmDeleteTitle')}
        message={t('admin.users.confirmDelete', { name: user.nickname })}
        confirmLabel={t('admin.users.delete')}
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(false)}
        destructive
        pending={busy}
      />
    </div>
  );
}
