// Dialog for creating a new lobby. Handles its own form state and submission.
// On success, calls onCreated with the resulting lobby id so the parent can navigate.

import { useState, type FormEvent } from 'react';

import {
  LOBBY,
  MEMBER_ROLE,
  type CreateLobbyInput,
  type LobbyDetailsResponse,
} from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { Checkbox } from '@/components/ui/Checkbox.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { FormField } from '@/components/ui/FormField.js';
import { PasswordField } from '@/components/ui/PasswordField.js';
import {
  extractLobbyErrorMessage,
  useCreateLobby,
} from '@/features/lobby/hooks/useLobbyMutations.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';

interface CreateLobbyDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (lobby: LobbyDetailsResponse['lobby']) => void;
}

export function CreateLobbyDialog({ open, onClose, onCreated }: CreateLobbyDialogProps) {
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');

  const create = useCreateLobby();

  function handleClose() {
    if (create.isPending) return;
    create.reset();
    setName('');
    setIsPrivate(false);
    setPassword('');
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: CreateLobbyInput = {
      name: name.trim(),
      isPrivate,
      password: isPrivate ? password : undefined,
      // Creator always becomes the judge of their lobby — judges are not interchangeable
      // with players (the slot can't be reassigned after creation).
      hostRole: MEMBER_ROLE.JUDGE,
    };
    create.mutate(input, {
      onSuccess: (response) => {
        onCreated(response.lobby);
        handleClose();
      },
    });
  }

  const errorMessage = create.isError ? extractLobbyErrorMessage(create.error) : null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={LOBBY_MESSAGES.create.title}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={create.isPending}>
            {LOBBY_MESSAGES.create.cancel}
          </Button>
          <Button type="submit" form="create-lobby-form" disabled={create.isPending}>
            {create.isPending ? LOBBY_MESSAGES.create.submitting : LOBBY_MESSAGES.create.submit}
          </Button>
        </>
      }
    >
      <form id="create-lobby-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField
          label={LOBBY_MESSAGES.create.name}
          placeholder={LOBBY_MESSAGES.create.namePlaceholder}
          required
          minLength={LOBBY.NAME_MIN_LENGTH}
          maxLength={LOBBY.NAME_MAX_LENGTH}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={create.isPending}
        />

        <Checkbox
          label={LOBBY_MESSAGES.create.isPrivate}
          checked={isPrivate}
          onChange={(event) => setIsPrivate(event.target.checked)}
          disabled={create.isPending}
        />

        {isPrivate && (
          <div>
            <PasswordField
              label={LOBBY_MESSAGES.create.password}
              required
              minLength={LOBBY.PASSWORD_MIN_LENGTH}
              maxLength={LOBBY.PASSWORD_MAX_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={create.isPending}
            />
            <p className="mt-1 text-xs text-muted">{LOBBY_MESSAGES.create.passwordHint}</p>
          </div>
        )}

        <p className="text-xs text-muted">{LOBBY_MESSAGES.create.judgeNotice}</p>

        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}
      </form>
    </Dialog>
  );
}
