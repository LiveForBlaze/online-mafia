// Password prompt shown when the user clicks "Join" on a private lobby.
// Owns no state about the lobby itself — it only collects a password and
// invokes the join mutation passed in by the parent.

import { useState, type FormEvent } from 'react';

import type { LobbyDetailsResponse } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { PasswordField } from '@/components/ui/PasswordField.js';
import {
  extractLobbyErrorMessage,
  useJoinLobby,
} from '@/features/lobby/hooks/useLobbyMutations.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';

interface JoinPrivateLobbyDialogProps {
  open: boolean;
  lobbyId: string | null;
  onClose: () => void;
  onJoined: (lobby: LobbyDetailsResponse['lobby']) => void;
}

export function JoinPrivateLobbyDialog({
  open,
  lobbyId,
  onClose,
  onJoined,
}: JoinPrivateLobbyDialogProps) {
  const [password, setPassword] = useState('');
  const join = useJoinLobby();

  function handleClose() {
    if (join.isPending) return;
    join.reset();
    setPassword('');
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lobbyId) return;
    join.mutate(
      { lobbyId, input: { password } },
      {
        onSuccess: (response) => {
          onJoined(response.lobby);
          handleClose();
        },
      },
    );
  }

  const errorMessage = join.isError ? extractLobbyErrorMessage(join.error) : null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={LOBBY_MESSAGES.joinPrivate.title}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={join.isPending}>
            {LOBBY_MESSAGES.joinPrivate.cancel}
          </Button>
          <Button type="submit" form="join-private-form" disabled={join.isPending}>
            {join.isPending
              ? LOBBY_MESSAGES.joinPrivate.submitting
              : LOBBY_MESSAGES.joinPrivate.submit}
          </Button>
        </>
      }
    >
      <form id="join-private-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <PasswordField
          label={LOBBY_MESSAGES.joinPrivate.password}
          autoFocus
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={join.isPending}
        />
        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}
      </form>
    </Dialog>
  );
}
