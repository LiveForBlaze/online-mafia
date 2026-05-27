import { useState } from 'react';
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Check, ChevronLeft, Trash2, X } from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog.js';
import { toast } from '@/components/ui/Toaster.js';
import { ApiError } from '@/lib/api-client.js';
import {
  useApproveJoin,
  useCancelJoinRequest,
  useClubDetail,
  useDisbandClub,
  useJoinClub,
  useKickMember,
  useLeaveClub,
  useRejectJoin,
  useRenameClub,
  useTransferLeadership,
} from '@/features/clubs/hooks/useClubs.js';
import { TransferLeadershipDialog } from '@/features/clubs/components/TransferLeadershipDialog.js';
import { ROUTE_PATH, userProfilePath } from '@/routes/paths.js';

export function ClubDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const query = useClubDetail(code ?? '');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [confirmAction, setConfirmAction] = useState<null | 'leave' | 'disband' | 'kick'>(null);
  const [kickTargetId, setKickTargetId] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const rename = useRenameClub(code ?? '');
  const join = useJoinClub(code ?? '');
  const cancel = useCancelJoinRequest(code ?? '');
  const approve = useApproveJoin(code ?? '');
  const reject = useRejectJoin(code ?? '');
  const leave = useLeaveClub(code ?? '');
  const disband = useDisbandClub(code ?? '');
  const kick = useKickMember(code ?? '');
  const transfer = useTransferLeadership(code ?? '');

  if (!code) return <Navigate to={ROUTE_PATH.CLUBS} replace />;
  if (query.isPending) return null;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <Navigate to={ROUTE_PATH.CLUBS} replace />;
    }
    return (
      <p role="alert" className="p-6 text-danger">
        {(query.error as Error).message}
      </p>
    );
  }

  const club = query.data.club;
  const isHead = club.viewerStatus === 'head';

  function startRename() {
    setDraftName(club.name);
    setEditingName(true);
  }
  function cancelRename() {
    setEditingName(false);
  }
  async function commitRename() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === club.name) {
      cancelRename();
      return;
    }
    try {
      await rename.mutateAsync(trimmed);
      toast.success(t('clubs.actions.renamed'));
      setEditingName(false);
    } catch (err) {
      toast.error(extractError(err, t));
    }
  }

  async function handleSubmitJoin() {
    try {
      await join.mutateAsync();
      toast.success(t('clubs.actions.requestSent'));
    } catch (err) {
      toast.error(extractError(err, t));
    }
  }

  async function handleCancelRequest() {
    try {
      await cancel.mutateAsync();
      toast.success(t('clubs.actions.requestCancelled'));
    } catch (err) {
      toast.error(extractError(err, t));
    }
  }

  async function handleApprove(userId: string) {
    try {
      await approve.mutateAsync(userId);
      toast.success(t('clubs.actions.approved'));
    } catch (err) {
      toast.error(extractError(err, t));
    }
  }
  async function handleReject(userId: string) {
    try {
      await reject.mutateAsync(userId);
      toast.success(t('clubs.actions.rejected'));
    } catch (err) {
      toast.error(extractError(err, t));
    }
  }

  async function performLeave() {
    setConfirmAction(null);
    try {
      const res = await leave.mutateAsync();
      toast.success(res.disbanded ? t('clubs.actions.disbanded') : t('clubs.actions.left'));
      navigate(ROUTE_PATH.CLUBS);
    } catch (err) {
      toast.error(extractError(err, t));
    }
  }

  async function performDisband() {
    setConfirmAction(null);
    try {
      await disband.mutateAsync();
      toast.success(t('clubs.actions.disbanded'));
      navigate(ROUTE_PATH.CLUBS);
    } catch (err) {
      toast.error(extractError(err, t));
    }
  }

  async function performKick() {
    if (!kickTargetId) return;
    setConfirmAction(null);
    try {
      await kick.mutateAsync(kickTargetId);
      toast.success(t('clubs.actions.kicked'));
      setKickTargetId(null);
    } catch (err) {
      toast.error(extractError(err, t));
    }
  }

  async function performTransfer(newHeadId: string) {
    try {
      await transfer.mutateAsync(newHeadId);
      toast.success(t('clubs.actions.transferred'));
      setTransferOpen(false);
    } catch (err) {
      toast.error(extractError(err, t));
    }
  }

  const eligibleSuccessors = club.members.filter((m) => !m.isHead);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(ROUTE_PATH.CLUBS)}>
        <ChevronLeft className="h-4 w-4" /> {t('common.back')}
      </Button>

      <section className="rounded-xl border border-border bg-card p-6 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {editingName ? (
            <>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') cancelRename();
                }}
                autoFocus
                maxLength={40}
                disabled={rename.isPending}
                className="flex-1 min-w-0 rounded border border-accent bg-bg px-2 py-1 text-xl font-bold"
              />
              <button
                type="button"
                onClick={commitRename}
                disabled={rename.isPending}
                aria-label={t('common.save')}
                className="rounded p-1 text-success hover:bg-success/10"
              >
                <Check className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={cancelRename}
                disabled={rename.isPending}
                aria-label={t('common.cancel')}
                className="rounded p-1 text-muted hover:bg-bg"
              >
                <X className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-fg">{club.name}</h1>
              {isHead && (
                <button
                  type="button"
                  onClick={startRename}
                  className="text-xs text-muted hover:text-fg hover:underline"
                >
                  ✎ {t('clubs.actions.rename')}
                </button>
              )}
            </>
          )}
        </div>
        <div className="text-xs text-muted">
          #{club.publicCode} ·{' '}
          {t('clubs.detail.foundedOn', { date: new Date(club.createdAt).toLocaleDateString() })} ·{' '}
          {t('clubs.list.members', { count: club.members.length })}
        </div>
      </section>

      {/* Members */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          {t('clubs.detail.members')}
        </h2>
        <ul className="divide-y divide-border/60">
          {club.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2">
              <Avatar avatarUrl={m.avatarUrl} nickname={m.nickname} size={32} />
              <a
                href={userProfilePath(m.publicCode)}
                className="flex-1 truncate text-sm text-fg hover:underline"
              >
                {m.nickname}
              </a>
              {m.isHead && (
                <span className="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
                  {t('clubs.detail.headBadge')}
                </span>
              )}
              {isHead && !m.isHead && (
                <button
                  type="button"
                  onClick={() => {
                    setKickTargetId(m.userId);
                    setConfirmAction('kick');
                  }}
                  aria-label={t('clubs.actions.kick')}
                  className="rounded p-1 text-muted hover:text-danger hover:bg-danger/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Pending requests (head only, when present) */}
      {isHead && club.joinRequests.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            {t('clubs.detail.requests')}
          </h2>
          <ul className="divide-y divide-border/60">
            {club.joinRequests.map((r) => (
              <li key={r.userId} className="flex items-center gap-3 py-2">
                <Avatar avatarUrl={r.avatarUrl} nickname={r.nickname} size={32} />
                <span className="flex-1 truncate text-sm text-fg">{r.nickname}</span>
                <button
                  type="button"
                  onClick={() => handleApprove(r.userId)}
                  disabled={approve.isPending}
                  className="rounded p-1 text-success hover:bg-success/10 disabled:opacity-50"
                  aria-label={t('clubs.actions.approve')}
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(r.userId)}
                  disabled={reject.isPending}
                  className="rounded p-1 text-danger hover:bg-danger/10 disabled:opacity-50"
                  aria-label={t('clubs.actions.reject')}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Viewer action zone */}
      <section className="space-y-2">
        {club.viewerStatus === 'none' && (
          <Button onClick={handleSubmitJoin} disabled={join.isPending}>
            {join.isPending ? t('clubs.actions.joining') : t('clubs.actions.submitRequest')}
          </Button>
        )}
        {club.viewerStatus === 'pending' && (
          <div className="space-y-1">
            <p className="text-sm text-muted">{t('clubs.actions.requestPending')}</p>
            <Button variant="secondary" onClick={handleCancelRequest} disabled={cancel.isPending}>
              {cancel.isPending ? t('clubs.actions.cancelling') : t('clubs.actions.cancelRequest')}
            </Button>
          </div>
        )}
        {club.viewerStatus === 'member' && (
          <Button
            variant="secondary"
            onClick={() => setConfirmAction('leave')}
            className="border-danger/40 text-danger hover:bg-danger/10"
          >
            {t('clubs.actions.leave')}
          </Button>
        )}
        {isHead && (
          <div className="flex flex-wrap gap-2">
            {eligibleSuccessors.length > 0 && (
              <Button variant="secondary" onClick={() => setTransferOpen(true)}>
                {t('clubs.actions.transfer')}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => setConfirmAction('disband')}
              className="border-danger/40 text-danger hover:bg-danger/10"
            >
              {t('clubs.actions.disband')}
            </Button>
          </div>
        )}
      </section>

      {/* Confirmations */}
      <ConfirmDialog
        open={confirmAction === 'leave'}
        title={t(isHead ? 'clubs.confirm.leaveAsHeadTitle' : 'clubs.confirm.leaveTitle')}
        message={t(
          isHead && eligibleSuccessors.length > 0
            ? 'clubs.confirm.leaveAsHeadBody'
            : isHead
              ? 'clubs.confirm.leaveAsLoneHeadBody'
              : 'clubs.confirm.leaveBody',
          { name: club.name },
        )}
        confirmLabel={t('clubs.actions.leave')}
        destructive
        pending={leave.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={performLeave}
      />
      <ConfirmDialog
        open={confirmAction === 'disband'}
        title={t('clubs.confirm.disbandTitle')}
        message={t('clubs.confirm.disbandBody', { name: club.name })}
        confirmLabel={t('clubs.actions.disband')}
        destructive
        pending={disband.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={performDisband}
      />
      <ConfirmDialog
        open={confirmAction === 'kick'}
        title={t('clubs.confirm.kickTitle')}
        message={t('clubs.confirm.kickBody', {
          name: club.members.find((m) => m.userId === kickTargetId)?.nickname ?? '',
        })}
        confirmLabel={t('clubs.actions.kick')}
        destructive
        pending={kick.isPending}
        onCancel={() => {
          setConfirmAction(null);
          setKickTargetId(null);
        }}
        onConfirm={performKick}
      />
      <TransferLeadershipDialog
        open={transferOpen}
        members={eligibleSuccessors}
        pending={transfer.isPending}
        onCancel={() => setTransferOpen(false)}
        onConfirm={performTransfer}
      />
    </div>
  );
}

function extractError(err: unknown, t: TFunction): string {
  const message = err instanceof ApiError ? err.message : (err as Error).message;
  return t(`clubs.errors.${message}`, { defaultValue: message });
}
