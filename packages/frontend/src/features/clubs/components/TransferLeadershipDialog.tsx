import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ClubMember } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';

interface Props {
  open: boolean;
  members: ClubMember[]; // active members; the current head is filtered out by the parent
  pending: boolean;
  onCancel: () => void;
  onConfirm: (newHeadId: string) => void;
}

export function TransferLeadershipDialog({ open, members, pending, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>('');
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onCancel();
      }}
      title={t('clubs.confirm.transferTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => selected && onConfirm(selected)} disabled={pending || !selected}>
            {pending ? t('clubs.confirm.transferring') : t('clubs.confirm.transferConfirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg">{t('clubs.confirm.transferBody')}</p>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={pending}
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
      >
        <option value="">{t('clubs.confirm.transferPickPlaceholder')}</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.nickname} · #{m.publicCode}
          </option>
        ))}
      </select>
    </Dialog>
  );
}
