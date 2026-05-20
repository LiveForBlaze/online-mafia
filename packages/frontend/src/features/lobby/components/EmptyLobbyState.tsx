// Empty-state card shown when no public lobbies exist.
// Heading + body + primary CTA that opens the "Create lobby" dialog
// (the parent owns the dialog state).

import { Button } from '@/components/ui/Button.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';

interface EmptyLobbyStateProps {
  onCreate: () => void;
}

export function EmptyLobbyState({ onCreate }: EmptyLobbyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-fg">{LOBBY_MESSAGES.list.emptyTitle}</h2>
        <p className="text-sm text-muted max-w-sm">{LOBBY_MESSAGES.list.emptyDescription}</p>
      </div>
      <Button onClick={onCreate}>{LOBBY_MESSAGES.list.emptyCta}</Button>
    </div>
  );
}
