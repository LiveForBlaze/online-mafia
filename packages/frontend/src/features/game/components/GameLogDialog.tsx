// Host-only debrief modal. Pulls the formatted event log from the backend
// every time it opens (and on a slow poll while open) and renders it as a
// scrollable monospace list. Section headers ("── Ночь N ──") read as
// dividers; everything else is plain log lines.

import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { cn } from '@/lib/cn.js';
import { gameApi } from '@/features/game/api/game.api.js';

interface GameLogDialogProps {
  gameId: string;
  open: boolean;
  onClose: () => void;
}

export function GameLogDialog({ gameId, open, onClose }: GameLogDialogProps) {
  const logQuery = useQuery({
    queryKey: ['game', gameId, 'log'],
    queryFn: () => gameApi.log(gameId),
    enabled: open,
    refetchInterval: open ? 3_000 : false,
  });

  const lines = logQuery.data?.lines ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Лог партии"
      className="max-w-xl"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Закрыть
        </Button>
      }
    >
      <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-bg p-3 font-mono text-sm leading-relaxed">
        {logQuery.isLoading && <p className="text-muted">Загрузка...</p>}
        {logQuery.isError && <p className="text-danger">Не удалось загрузить лог</p>}
        {!logQuery.isLoading && !logQuery.isError && lines.length === 0 && (
          <p className="text-muted">События пока не записаны</p>
        )}
        <ul className="space-y-0.5">
          {lines.map((line, idx) => {
            const isSection = line.startsWith('──');
            return (
              <li
                key={idx}
                className={cn(
                  isSection ? 'mt-3 text-accent font-semibold uppercase tracking-wider' : 'text-fg',
                )}
              >
                {line}
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
