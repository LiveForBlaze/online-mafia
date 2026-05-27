// Modal to create a new club. Single name input + server-side moderation +
// uniqueness. On success navigates parent to /clubs/:newCode.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { toast } from '@/components/ui/Toaster.js';
import { ApiError } from '@/lib/api-client.js';
import { useCreateClub } from '@/features/clubs/hooks/useClubs.js';

interface CreateClubDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (code: string) => void;
}

export function CreateClubDialog({ open, onClose, onCreated }: CreateClubDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const create = useCreateClub();

  async function handleSubmit() {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    try {
      const res = await create.mutateAsync(trimmed);
      toast.success(t('clubs.create.success'));
      setName('');
      onCreated(res.club.publicCode);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err as Error).message;
      toast.error(t(`clubs.errors.${message}`, { defaultValue: message }));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      title={t('clubs.create.dialogTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={create.isPending || name.trim().length < 2}>
            {create.isPending ? t('clubs.create.creating') : t('clubs.create.submit')}
          </Button>
        </>
      }
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('clubs.create.namePlaceholder')}
        maxLength={40}
        autoFocus
        disabled={create.isPending}
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
      />
    </Dialog>
  );
}
