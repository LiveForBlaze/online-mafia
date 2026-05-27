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

import {
  BAN_RESTRICTION,
  ALL_BAN_RESTRICTIONS,
  type AdminLobbySummary,
  type AdminUserSummary,
  type BanRestrictionCode,
} from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
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

function LobbiesTab() {
  const { t } = useTranslation();
  // Дефолтный фильтр — ACTIVE (открытые + в игре). Закрытые шумят и
  // не требуют действий, их прячем пока админ не запросит явно.
  const [statusFilter, setStatusFilter] = useState<LobbyStatusFilter>('ACTIVE');
  const [search, setSearch] = useState('');
  const [lobbies, setLobbies] = useState<AdminLobbySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminApi
      .listLobbies({ status: statusFilter, search: search || undefined })
      .then((res) => {
        if (!cancelled) {
          setLobbies(res.lobbies);
          setTotal(res.total);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, search, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

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
        {t('admin.lobbies.count', { count: total })}
        {loading && <span className="ml-2">…</span>}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

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
    </section>
  );
}

function LobbyRow({ lobby, onChanged }: { lobby: AdminLobbySummary; onChanged: () => void }) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(lobby.name);
  const [busy, setBusy] = useState(false);

  async function commitRename() {
    if (draftName.trim() === lobby.name || !draftName.trim()) {
      setRenaming(false);
      setDraftName(lobby.name);
      return;
    }
    setBusy(true);
    try {
      await adminApi.renameLobby(lobby.id, { name: draftName.trim() });
      setRenaming(false);
      onChanged();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function closeNow() {
    if (!confirm(t('admin.lobbies.confirmClose', { name: lobby.name }))) return;
    setBusy(true);
    try {
      await adminApi.closeLobby(lobby.id);
      onChanged();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td className="px-3 py-2">
        {renaming ? (
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setRenaming(false);
                setDraftName(lobby.name);
              }
            }}
            autoFocus
            className="w-full rounded border border-accent bg-bg px-2 py-1 text-sm"
          />
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
            onClick={closeNow}
            disabled={busy}
            className="border-danger/40 text-danger hover:bg-danger/10"
          >
            {t('admin.lobbies.forceClose')}
          </Button>
        )}
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
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminApi
      .listUsers({ search: search || undefined })
      .then((res) => {
        if (!cancelled) {
          setUsers(res.users);
          setTotal(res.total);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <section className="space-y-3">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('admin.users.searchPlaceholder')}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
      />

      <div className="text-xs text-muted">
        {t('admin.users.count', { count: total })}
        {loading && <span className="ml-2">…</span>}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {users.map((u) => (
          <UserCard key={u.id} user={u} onChanged={refresh} />
        ))}
        {!loading && users.length === 0 && (
          <p className="text-center text-muted py-6">{t('admin.users.empty')}</p>
        )}
      </div>
    </section>
  );
}

function UserCard({ user, onChanged }: { user: AdminUserSummary; onChanged: () => void }) {
  const { t } = useTranslation();
  const [restrictions, setRestrictions] = useState<BanRestrictionCode[]>(
    user.banRestrictions as BanRestrictionCode[],
  );
  const [reason, setReason] = useState(user.banReason ?? '');
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(user.nickname);

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
      onChanged();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function commitRename() {
    if (draftName.trim() === user.nickname || !draftName.trim()) {
      setEditingName(false);
      setDraftName(user.nickname);
      return;
    }
    setBusy(true);
    try {
      await adminApi.renameUser(user.id, { nickname: draftName.trim() });
      setEditingName(false);
      onChanged();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function hardDelete() {
    if (!confirm(t('admin.users.confirmDelete', { name: user.nickname }))) return;
    setBusy(true);
    try {
      await adminApi.deleteUser(user.id);
      onChanged();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            {editingName ? (
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    setEditingName(false);
                    setDraftName(user.nickname);
                  }
                }}
                autoFocus
                className="rounded border border-accent bg-bg px-2 py-1 text-sm font-semibold"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-base font-semibold text-fg hover:underline"
                title={t('admin.users.renameHint')}
              >
                {user.nickname}
              </button>
            )}
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
          </div>
          <div className="text-xs text-muted">
            {user.email} · #{user.publicCode}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={hardDelete}
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
                <div className="font-medium text-fg">{t(`admin.users.restrictions.${code}`)}</div>
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
  );
}
