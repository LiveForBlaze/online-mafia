import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, X } from 'lucide-react';

import {
  BAN_RESTRICTION,
  ALL_BAN_RESTRICTIONS,
  type AdminUserSummary,
  type BanRestrictionCode,
} from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog.js';
import { toast } from '@/components/ui/Toaster.js';
import { cn } from '@/lib/cn.js';
import { ApiError } from '@/lib/api-client.js';
import { adminApi } from '@/features/admin/api/admin.api.js';

export function UserCard({ user, onChanged }: { user: AdminUserSummary; onChanged: () => void }) {
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
              <span className="rounded bg-accent/20 px-1.5 py-0.5 text-2xs font-bold uppercase text-accent">
                admin
              </span>
            )}
            {user.isBot && (
              <span className="rounded bg-muted/20 px-1.5 py-0.5 text-2xs uppercase text-muted">
                bot
              </span>
            )}
            {hasSiteBan ? (
              <span className="rounded bg-danger/20 px-1.5 py-0.5 text-2xs font-bold uppercase text-danger">
                {t('admin.users.statusBlocked')}
              </span>
            ) : hasBan ? (
              <span className="rounded bg-warning/20 px-1.5 py-0.5 text-2xs font-bold uppercase text-warning">
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
                disabled={user.isAdmin}
                className="text-sm text-muted hover:text-fg hover:underline disabled:opacity-50 disabled:hover:no-underline"
                title={
                  user.isAdmin ? t('admin.users.cannotModifyAdmin') : t('admin.users.renameHint')
                }
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
                disabled={busy || !isDirty || user.isAdmin}
                title={user.isAdmin ? t('admin.users.cannotModifyAdmin') : undefined}
              >
                {t('admin.users.apply')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={applyAll}
                disabled={busy || user.isAdmin}
              >
                {t('admin.users.applyAll')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={clearAll}
                disabled={busy || restrictions.length === 0 || user.isAdmin}
              >
                {t('admin.users.unban')}
              </Button>
            </div>

            {user.isAdmin && (
              <p className="text-xs text-muted italic">{t('admin.users.cannotModifyAdmin')}</p>
            )}

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
