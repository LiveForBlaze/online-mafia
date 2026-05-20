// Dialog for creating a new lobby. Handles its own form state and submission.
// On success, calls onCreated with the resulting lobby id so the parent can navigate.

import { useState, type FormEvent } from 'react';

import {
  LOBBY,
  MEMBER_ROLE,
  type CreateLobbyInput,
  type LobbyDetailsResponse,
  type MemberRole,
} from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { Checkbox } from '@/components/ui/Checkbox.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { FormField } from '@/components/ui/FormField.js';
import { Label } from '@/components/ui/Label.js';
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
  const [hostRole, setHostRole] = useState<MemberRole>(MEMBER_ROLE.PLAYER);

  const create = useCreateLobby();

  function handleClose() {
    if (create.isPending) return;
    create.reset();
    setName('');
    setIsPrivate(false);
    setPassword('');
    setHostRole(MEMBER_ROLE.PLAYER);
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: CreateLobbyInput = {
      name: name.trim(),
      isPrivate,
      password: isPrivate ? password : undefined,
      hostRole,
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
            <FormField
              label={LOBBY_MESSAGES.create.password}
              type="password"
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

        <div>
          <Label>{LOBBY_MESSAGES.create.role}</Label>
          <div className="flex gap-4">
            <RoleRadio
              value={MEMBER_ROLE.PLAYER}
              label={LOBBY_MESSAGES.create.rolePlayer}
              current={hostRole}
              onSelect={setHostRole}
              disabled={create.isPending}
            />
            <RoleRadio
              value={MEMBER_ROLE.JUDGE}
              label={LOBBY_MESSAGES.create.roleJudge}
              current={hostRole}
              onSelect={setHostRole}
              disabled={create.isPending}
            />
          </div>
        </div>

        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}
      </form>
    </Dialog>
  );
}

interface RoleRadioProps {
  value: MemberRole;
  label: string;
  current: MemberRole;
  onSelect: (role: MemberRole) => void;
  disabled?: boolean;
}

function RoleRadio({ value, label, current, onSelect, disabled }: RoleRadioProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-fg cursor-pointer select-none">
      <input
        type="radio"
        name="hostRole"
        value={value}
        checked={current === value}
        onChange={() => onSelect(value)}
        disabled={disabled}
        className="text-accent focus:ring-2 focus:ring-accent"
      />
      {label}
    </label>
  );
}
