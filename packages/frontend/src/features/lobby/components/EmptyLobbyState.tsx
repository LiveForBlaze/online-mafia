// Empty-state card shown when no public lobbies exist.
// Stylized seat-around-a-table inline SVG + heading + body + primary CTA
// that opens the "Create lobby" dialog (the parent owns the dialog state).

import { Button } from '@/components/ui/Button.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';

interface EmptyLobbyStateProps {
  onCreate: () => void;
}

export function EmptyLobbyState({ onCreate }: EmptyLobbyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
      <TableIcon />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-fg">{LOBBY_MESSAGES.list.emptyTitle}</h2>
        <p className="text-sm text-muted">{LOBBY_MESSAGES.list.emptyDescription}</p>
      </div>
      <Button onClick={onCreate}>{LOBBY_MESSAGES.list.emptyCta}</Button>
    </div>
  );
}

// A tiny stylized "table with seats" mark. Uses currentColor so it picks up
// the surrounding text colour and adapts to both themes.
function TableIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-muted"
    >
      {/* Table */}
      <ellipse cx="32" cy="34" rx="18" ry="9" />
      {/* Seats */}
      <circle cx="12" cy="34" r="3" />
      <circle cx="52" cy="34" r="3" />
      <circle cx="22" cy="18" r="3" />
      <circle cx="42" cy="18" r="3" />
      <circle cx="22" cy="50" r="3" />
      <circle cx="42" cy="50" r="3" />
    </svg>
  );
}
