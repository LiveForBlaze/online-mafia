// Landing hero. Two-line display wordmark on the left (МАФИЯ — white,
// ОНЛАЙН — brand accent red), splash artwork on the right, meta row above
// and CTA + live stats below.
//
// Раньше пробовал outline-эффект через `-webkit-text-stroke` на нижней
// строке, но на extrabold-шрифте контур читался как тонкие сломанные
// линии. Вернули solid accent — двухцветный hierarchy сохраняется, видно
// сразу из любой локали без зависимости от того, есть ли в шрифте
// outline-глифы.

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import type { HomeStats } from '@mafia/shared';

import { BAN_RESTRICTION } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { ROUTE_PATH } from '@/routes/paths.js';

interface HomeHeroProps {
  onCreateLobby: () => void;
  stats: HomeStats | undefined;
}

export function HomeHero({ onCreateLobby, stats }: HomeHeroProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const cannotCreate = useAuthStore((s) => s.user?.banRestrictions ?? []).includes(
    BAN_RESTRICTION.CREATE_LOBBY,
  );
  return (
    <section className="relative grid grid-cols-1 md:grid-cols-[5fr_7fr] gap-6 md:gap-10 items-center pt-4 sm:pt-8">
      {/* Decorative soft cherry radial glow behind the wordmark/splash. Purely
          ornamental — aria-hidden, pointer-events disabled (see .hero-glow). */}
      <div aria-hidden="true" className="hero-glow" />

      <div className="relative space-y-7">
        {/* Meta row: альфа-чип + OSS-метки. Капс с тонким tracking — звучит
            как titlecard, а не как извинение за бета-статус. `tabular-nums`
            фиксирует ширину цифр (MIT / LiveKit имеют буквы и могут плыть
            от прокси/моно вкраплений — `tnum` гасит дрейф). */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs uppercase tracking-[0.18em] text-muted tabular-nums"
          style={{ fontFeatureSettings: '"tnum", "ss01"' }}
        >
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
          <span className="block text-accent">{t('hero.title_bottom')}</span>
        </h1>

        <div className="space-y-1">
          <p className="text-base sm:text-lg text-fg">{t('hero.tagline_primary')}</p>
          <p className="text-sm sm:text-base text-muted max-w-md">{t('hero.tagline_body')}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={onCreateLobby}
            size="lg"
            disabled={cannotCreate}
            title={cannotCreate ? t('lobby.list.cannotCreateBanned') : undefined}
            className="motion-safe:transition-shadow enabled:hover:shadow-glow-accent"
          >
            + {t('common.create_lobby')}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate(ROUTE_PATH.RULES)}>
            {t('common.how_to_play')}
          </Button>
        </div>

        <StatsRow stats={stats} />
      </div>

      <div className="relative hidden md:flex justify-end">
        <SplashImage />
      </div>
    </section>
  );
}

function StatsRow({ stats }: { stats: HomeStats | undefined }) {
  const { t } = useTranslation();
  // Визуальная иерархия: число — крупное и жирное, подпись — тонкая
  // моноширинная под ним. До этого было наоборот (label крупнее визуально
  // чем 1px-bump-ом number'а), что хоронило саму метрику.
  //
  // Подписи берём через i18n с count — i18next подбирает one/few/many/other
  // по локали (русский: 1 → активная игра, 2-4 → активные игры,
  // 5+ → активных игр). Без count'а в строке: число рендерим отдельно
  // крупным шрифтом, label'у достаётся только существительное.
  const activeGames = stats?.activeGames ?? 0;
  return (
    // Raised "stat band": elevated surface that lifts the live numbers off the
    // page. Dividers (divide-x) separate the individual stats.
    <dl className="inline-flex flex-wrap items-stretch divide-x divide-border rounded-xl border border-border bg-card-hover shadow-elev">
      <Stat
        value={stats?.openLobbies}
        label={t('hero.statsOpenLobbies', { count: stats?.openLobbies ?? 0 })}
      />
      <Stat
        value={stats?.activeGames}
        label={t('hero.statsActiveGames', { count: activeGames })}
        // Live pulse only when there's actually a game running.
        live={activeGames > 0}
      />
    </dl>
  );
}

function Stat({
  value,
  label,
  live = false,
}: {
  value: number | undefined;
  label: string;
  live?: boolean;
}) {
  const displayValue = value === undefined ? '—' : value.toLocaleString('ru-RU');
  return (
    <div className="inline-flex items-baseline gap-2 whitespace-nowrap px-4 py-3 sm:px-5">
      {live && (
        <span
          aria-hidden="true"
          className="self-center h-1.5 w-1.5 shrink-0 rounded-full bg-success motion-safe:animate-pulse"
        />
      )}
      <dt className="sr-only">{label}</dt>
      <dd
        className="font-extrabold text-2xl sm:text-3xl text-fg tabular-nums"
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {displayValue}
      </dd>
      <span className="text-2xs sm:text-xs uppercase tracking-wider text-muted font-mono">
        {label}
      </span>
    </div>
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
