// Small confirmation dialog for destructive actions (kick, close, remove…).
//
// Render once at the page level with `open` derived from a piece of state that
// holds the pending intent. Call `onConfirm` to commit, `onCancel` to dismiss.

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  // Destructive actions use the danger-colored confirm button.
  destructive?: boolean;
  pending?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
  pending = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel');
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      // For destructive dialogs, land focus on Cancel so a stray Enter does
      // not fire the dangerous action. The footer order (Cancel → Confirm)
      // keeps the tab sequence safe as well.
      initialFocusRef={destructive ? cancelRef : undefined}
      footer={
        <>
          <Button ref={cancelRef} variant="ghost" onClick={onCancel} disabled={pending}>
            {resolvedCancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg">{message}</p>
    </Dialog>
  );
}
