// Small confirmation dialog for destructive actions (kick, close, remove…).
//
// Render once at the page level with `open` derived from a piece of state that
// holds the pending intent. Call `onConfirm` to commit, `onCancel` to dismiss.

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
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
  destructive = false,
  pending = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'primary' : 'primary'}
            onClick={onConfirm}
            disabled={pending}
            className={destructive ? 'bg-danger hover:bg-danger/90' : undefined}
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
