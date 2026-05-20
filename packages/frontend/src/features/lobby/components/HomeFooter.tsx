// Footer for the home page: left — "online-mafia · бета · MIT", right — social
// icons. Links are placeholders for now; the project owner will swap them for
// real channels later.

import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';

export function HomeFooter() {
  return (
    <footer className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-border text-xs text-muted">
      <span>{LOBBY_MESSAGES.list.footer}</span>
      <div className="flex items-center gap-4 text-muted">
        <SocialLink label="Discord" href="#">
          <DiscordIcon />
        </SocialLink>
        <SocialLink label="VK" href="#">
          <VkIcon />
        </SocialLink>
        <SocialLink label="Telegram" href="#">
          <TelegramIcon />
        </SocialLink>
      </div>
    </footer>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      target="_blank"
      rel="noreferrer noopener"
      className="hover:text-fg transition-colors"
    >
      {children}
    </a>
  );
}

const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true as const,
};

function DiscordIcon() {
  return (
    <svg {...svgProps}>
      <path d="M20 4.4A18 18 0 0 0 15.6 3l-.2.4A13 13 0 0 1 19 5.4a17 17 0 0 0-14 0A13 13 0 0 1 8.6 3.4L8.4 3A18 18 0 0 0 4 4.4 19 19 0 0 0 .7 17a18 18 0 0 0 5.5 2.8l1.1-1.7a12 12 0 0 1-1.8-.9l.4-.3a12 12 0 0 0 12.2 0l.4.3c-.6.4-1.2.7-1.8 1l1 1.6A18 18 0 0 0 23.3 17 19 19 0 0 0 20 4.4zM8.4 14a2 2 0 0 1-1.8-2.1c0-1.2.8-2.1 1.8-2.1s1.8 1 1.8 2.1S9.4 14 8.4 14zm7.2 0a2 2 0 0 1-1.8-2.1c0-1.2.8-2.1 1.8-2.1s1.8 1 1.8 2.1-.8 2.1-1.8 2.1z" />
    </svg>
  );
}

function VkIcon() {
  return (
    <svg {...svgProps}>
      <path d="M21 8.4c.2-.5 0-.9-.7-.9h-2.4c-.6 0-.8.3-1 .6 0 0-1.2 2.9-2.8 4.7-.5.5-.8.7-1 .7-.2 0-.3-.2-.3-.7V8.4c0-.6-.2-.9-.7-.9H7.7c-.4 0-.6.3-.6.5 0 .5.8.6.9 2.2v3.3c0 .8-.1.9-.3.9-.7 0-2.4-2.9-3.4-6.2-.2-.6-.4-.8-1-.8H1c-.6 0-.7.3-.7.6 0 .7 1 4 4 8.4 2 3 4.9 4.6 7.4 4.6 1.5 0 1.7-.3 1.7-.9V19c0-.7.2-.9.6-.9.3 0 .9.2 2.2 1.5 1.5 1.5 1.8 2.2 2.6 2.2h2.5c.7 0 1-.3.8-1-.2-.6-1.1-1.6-2.3-2.7-.7-.8-1.7-1.6-2-2.1-.4-.6-.3-.8 0-1.4 0 0 3.4-4.8 3.8-6.4z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg {...svgProps}>
      <path d="M22 3 2 11l5.5 1.6L18 7l-8 7.5.6 5.5 3-3.6 5.6 4L22 3z" />
    </svg>
  );
}
