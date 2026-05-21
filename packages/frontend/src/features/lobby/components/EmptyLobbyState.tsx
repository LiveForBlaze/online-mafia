// Empty-state card shown when no public lobbies exist.
// Heading + body + primary CTA that opens the "Create lobby" dialog
// (the parent owns the dialog state).

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button.js';

interface EmptyLobbyStateProps {
  onCreate: () => void;
}

export function EmptyLobbyState({ onCreate }: EmptyLobbyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-fg">{t('lobby.list.emptyTitle')}</h2>
        <p className="text-sm text-muted max-w-sm">{t('lobby.list.emptyDescription')}</p>
      </div>
      <Button onClick={onCreate}>{t('lobby.list.emptyCta')}</Button>
    </div>
  );
}
