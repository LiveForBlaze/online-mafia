// Chat panel rendered in the lobby waiting room.
//
// Single-pane: scrollable message list above, input + send below. Messages
// auto-scroll to the bottom when a new one arrives unless the user has
// scrolled up — in which case we leave the viewport alone (otherwise reading
// older messages would constantly snap to the bottom).

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import { LOBBY_CHAT_MAX_LENGTH, type LobbyChatMessage } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { Input } from '@/components/ui/Input.js';
import { cn } from '@/lib/cn.js';
import { useLobbyChat } from '@/features/lobby/hooks/useLobbyChat.js';
import { userProfilePath } from '@/routes/paths.js';

interface LobbyChatProps {
  lobbyId: string;
  viewerUserId: string;
  className?: string;
}

export function LobbyChat({ lobbyId, viewerUserId, className }: LobbyChatProps) {
  const { t } = useTranslation();
  const { messages, send } = useLobbyChat(lobbyId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // YouTube-style "follow new messages while you're at the bottom" tracker.
  // Recomputed on every scroll so the moment a user drags up, we stop snapping
  // their viewport — but the moment they drag back to the bottom, we resume.
  const stickToBottom = useRef(true);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    stickToBottom.current = distance < 24;
  }

  useEffect(() => {
    if (!stickToBottom.current) return;
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const text = draft.trim();
    if (text.length === 0) return;
    setSending(true);
    const ack = await send(text);
    setSending(false);
    if (ack.ok) {
      setDraft('');
      // Keep the input focused so the next message is just type-and-Enter
      // away — the conversation flows continuously instead of forcing the
      // user to re-click after every send.
      inputRef.current?.focus();
      // Sending implies they're engaged with the bottom of the conversation;
      // re-arm follow-mode so the broadcast they're about to see auto-scrolls.
      stickToBottom.current = true;
    }
  }

  return (
    <div className={cn('flex flex-col rounded-lg border border-border bg-card', className)}>
      <header className="px-3 py-2 border-b border-border text-xs uppercase tracking-wider text-muted">
        {t('lobby.chat.title')}
      </header>
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted">{t('lobby.chat.empty')}</p>
        ) : (
          messages.map((m) => (
            <ChatMessageRow key={m.id} message={m} isOwn={m.fromUserId === viewerUserId} />
          ))
        )}
      </div>
      <form
        onSubmit={handleSend}
        className="border-t border-border p-2 flex items-center gap-2"
        noValidate
      >
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('lobby.chat.placeholder')}
          maxLength={LOBBY_CHAT_MAX_LENGTH}
          disabled={sending}
          aria-label={t('lobby.chat.placeholder')}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={sending || draft.trim().length === 0}>
          {t('lobby.chat.send')}
        </Button>
      </form>
    </div>
  );
}

function ChatMessageRow({ message, isOwn }: { message: LobbyChatMessage; isOwn: boolean }) {
  const time = new Date(message.sentAt);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  return (
    <div className="text-sm leading-snug">
      <span className="text-xs font-mono text-muted mr-2">
        {hh}:{mm}
      </span>
      {message.fromPublicCode ? (
        <Link
          to={userProfilePath(message.fromPublicCode)}
          className={cn('font-semibold hover:underline', isOwn ? 'text-accent' : 'text-fg')}
        >
          {message.fromNickname}
        </Link>
      ) : (
        <span className={cn('font-semibold', isOwn ? 'text-accent' : 'text-fg')}>
          {message.fromNickname}
        </span>
      )}
      <span className="text-fg">: {message.text}</span>
    </div>
  );
}
