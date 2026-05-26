// Главный футер. Три колонки ссылок (product / community / project) +
// слева левая зона с лого и MIT-чипом + нижняя строка: версия, place credit,
// language switcher.
//
// Реальные внешние линки — только GitHub (репо есть). Раздел community
// сейчас пуст по факту (Discord нет, Telegram нет): рендерим только
// «Issues» как единственный реальный канал — добавим Discord/Telegram когда
// они появятся, не раньше.

import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ExternalLink, Heart, Send } from 'lucide-react';

import { ROUTE_PATH } from '@/routes/paths.js';

const REPO_URL = 'https://github.com/LiveForBlaze/online-mafia';
const ISSUES_URL = `${REPO_URL}/issues`;
const TELEGRAM_URL = 'https://t.me/onlinemafiacom';

const PRODUCT_LINKS = [
  { key: 'lobbies', to: ROUTE_PATH.HOME },
  { key: 'players', to: ROUTE_PATH.PLAYERS },
  { key: 'clubs', to: ROUTE_PATH.CLUBS },
  { key: 'tournaments', to: ROUTE_PATH.TOURNAMENTS },
  { key: 'rules', to: ROUTE_PATH.RULES },
] as const;

const PROJECT_LINKS = [
  { key: 'github', href: REPO_URL },
  { key: 'issues', href: ISSUES_URL },
  { key: 'selfhost', href: `${REPO_URL}#self-hosting` },
  { key: 'license', href: `${REPO_URL}/blob/main/LICENSE` },
] as const;

export function SiteFooter() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <footer className="mt-12 border-t border-border pt-8 pb-6 text-sm">
      <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr]">
        {/* Brand column */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => navigate(ROUTE_PATH.HOME)}
            className="text-lg font-extrabold uppercase tracking-tight text-fg hover:text-accent transition-colors"
          >
            {t('footer.brand')}
          </button>
          <p className="text-xs text-muted leading-relaxed max-w-xs">{t('footer.tagline')}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-muted hover:text-fg hover:border-fg transition-colors"
            >
              <ExternalLink size={12} aria-hidden="true" />
              GitHub
            </a>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-muted hover:text-fg hover:border-fg transition-colors"
              aria-label="Telegram"
            >
              <Send size={12} aria-hidden="true" />
              Telegram
            </a>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/5 px-2 py-1 text-warning">
              <Heart size={12} aria-hidden="true" />
              MIT
            </span>
          </div>
        </div>

        <FooterColumn
          title={t('footer.colProduct')}
          items={PRODUCT_LINKS.map((l) => ({
            label: t(`footer.product.${l.key}`),
            to: l.to,
          }))}
        />

        <FooterColumn
          title={t('footer.colProject')}
          items={PROJECT_LINKS.map((l) => ({
            label: t(`footer.project.${l.key}`),
            href: l.href,
          }))}
        />
      </div>

      <div className="mt-8 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        <span className="font-mono">v{__APP_VERSION__}-alpha</span>
      </div>
    </footer>
  );
}

interface FooterItem {
  label: string;
  to?: string;
  href?: string;
}

function FooterColumn({ title, items }: { title: string; items: FooterItem[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted">{title}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label}>
            {item.to ? (
              <Link to={item.to} className="text-fg/80 hover:text-fg hover:underline">
                {item.label}
              </Link>
            ) : (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg/80 hover:text-fg hover:underline"
              >
                {item.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
