// Landing-style hero for the lobby list page. Big two-tone title, subtitle,
// primary + secondary CTAs, and the splash artwork on the right.

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/Button.js';
import { ROUTE_PATH } from '@/routes/paths.js';

interface HomeHeroProps {
  onCreateLobby: () => void;
}

export function HomeHero({ onCreateLobby }: HomeHeroProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <section className="relative grid grid-cols-1 md:grid-cols-[5fr_7fr] gap-6 md:gap-10 items-center py-6 sm:py-10">
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
            {t('hero.alpha_badge')}
          </span>
        </div>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold leading-[0.95] tracking-tight uppercase">
          <span className="block text-fg">{t('hero.title_top')}</span>
          <span className="block text-accent">{t('hero.title_bottom')}</span>
        </h1>
        <div className="space-y-1">
          <p className="text-base sm:text-lg text-fg">{t('hero.tagline_primary')}</p>
          <p className="text-sm sm:text-base text-muted">{t('hero.tagline_secondary')}</p>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <Button onClick={onCreateLobby} size="lg">
            {t('common.create_lobby')}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate(ROUTE_PATH.RULES)}>
            {t('common.how_to_play')}
          </Button>
        </div>
      </div>

      <div className="hidden md:flex justify-end">
        <SplashImage />
      </div>
    </section>
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
      className="relative w-full aspect-[16/10] bg-no-repeat bg-center bg-cover"
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
