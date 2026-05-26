// Landing hero, redesigned. Two-line display wordmark («МАФИЯ» filled +
// «ОНЛАЙН» outline) on the left, splash artwork on the right, with a meta
// row above and CTA + live stats below. Replaces the previous compact hero.
//
// Why two text-stroke layers: чтобы получить «outline + fill» эффект, нижняя
// строка использует `text-stroke` (webkit) с прозрачной заливкой — это даёт
// контурный шрифт без отдельных SVG, и текст остаётся i18n-friendly (любая
// локаль рендерится как контур, не нужно перерисовывать ассеты).

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import type { HomeStats } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { ROUTE_PATH } from '@/routes/paths.js';

interface HomeHeroProps {
  onCreateLobby: () => void;
  stats: HomeStats | undefined;
}

export function HomeHero({ onCreateLobby, stats }: HomeHeroProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <section className="relative grid grid-cols-1 md:grid-cols-[5fr_7fr] gap-6 md:gap-10 items-center pt-4 sm:pt-8">
      <div className="space-y-6">
        {/* Meta row: альфа-чип + OSS-метки. Капс с тонким tracking — звучит
            как titlecard, а не как извинение за бета-статус. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.18em] text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 font-semibold text-warning">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
            {t('hero.alpha_badge')}
          </span>
          <span aria-hidden="true">·</span>
          <span>{t('hero.metaOss')}</span>
          <span aria-hidden="true">·</span>
          <span>{t('hero.metaLicense')}</span>
          <span aria-hidden="true">·</span>
          <span>{t('hero.metaVideo')}</span>
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold leading-[0.95] tracking-tight uppercase">
          <span className="block text-fg">{t('hero.title_top')}</span>
          <span
            className="block text-transparent"
            style={{
              WebkitTextStroke: '2px var(--color-fg)',
            }}
          >
            {t('hero.title_bottom')}
          </span>
        </h1>

        <div className="space-y-1">
          <p className="text-base sm:text-lg text-fg">{t('hero.tagline_primary')}</p>
          <p className="text-sm sm:text-base text-muted max-w-md">{t('hero.tagline_body')}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={onCreateLobby} size="lg">
            + {t('common.create_lobby')}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate(ROUTE_PATH.RULES)}>
            {t('common.how_to_play')}
          </Button>
        </div>

        <StatsRow stats={stats} />
      </div>

      <div className="hidden md:flex justify-end">
        <SplashImage />
      </div>
    </section>
  );
}

function StatsRow({ stats }: { stats: HomeStats | undefined }) {
  const { t } = useTranslation();
  // Пока статистика грузится — показываем «—» вместо нулей, чтобы пустое
  // лобби-поле не выглядело как «ничего нет» (а на самом деле просто
  // запрос ещё не вернулся).
  const fmt = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString('ru-RU'));
  return (
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs uppercase tracking-wider text-muted">
      <div className="inline-flex items-baseline gap-1.5">
        <dt className="sr-only">{t('hero.statsOpenLobbies')}</dt>
        <dd className="text-fg font-semibold text-base">{fmt(stats?.openLobbies)}</dd>
        <span>{t('hero.statsOpenLobbies')}</span>
      </div>
      <span aria-hidden="true">·</span>
      <div className="inline-flex items-baseline gap-1.5">
        <dt className="sr-only">{t('hero.statsWaitingPlayers')}</dt>
        <dd className="text-fg font-semibold text-base">{fmt(stats?.waitingPlayers)}</dd>
        <span>{t('hero.statsWaitingPlayers')}</span>
      </div>
      <span aria-hidden="true">·</span>
      <div className="inline-flex items-baseline gap-1.5">
        <dt className="sr-only">{t('hero.statsLivePlayers')}</dt>
        <dd className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-fg font-semibold text-base">{fmt(stats?.livePlayers)}</span>
        </dd>
        <span>{t('hero.statsLivePlayers')}</span>
      </div>
    </dl>
  );
}

// The splash sits in /public so it's served straight by the static file server
// — no Vite import needed. A vignette-style mask fades all four edges of the
// image into the page bg so no hard rectangular crop reads. Implemented as
// two overlapping linear masks intersected via CSS mask-composite.
function SplashImage() {
  const verticalMask =
    'linear-gradient(to bottom, transparent 0%, black 16%, black 80%, transparent 100%)';
  const horizontalMask =
    'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)';
  return (
    <div
      className="relative w-full aspect-16/10 bg-no-repeat bg-center bg-cover"
      style={{
        backgroundImage: 'url(/splash-hero.png)',
        maskImage: `${verticalMask}, ${horizontalMask}`,
        WebkitMaskImage: `${verticalMask}, ${horizontalMask}`,
        maskComposite: 'intersect',
        WebkitMaskComposite: 'source-in',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
      }}
      aria-hidden="true"
    />
  );
}
