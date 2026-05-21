// Landing-style hero for the lobby list page. Big two-tone title, subtitle,
// primary + secondary CTAs, and the splash artwork on the right.

import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/Button.js';
import { ROUTE_PATH } from '@/routes/paths.js';

interface HomeHeroProps {
  onCreateLobby: () => void;
}

export function HomeHero({ onCreateLobby }: HomeHeroProps) {
  const navigate = useNavigate();
  return (
    <section className="relative grid grid-cols-1 md:grid-cols-[5fr_7fr] gap-6 md:gap-10 items-center py-6 sm:py-10">
      <div className="space-y-5">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold leading-[0.95] tracking-tight uppercase">
          <span className="block text-fg">Мафия</span>
          <span className="block text-accent">Онлайн</span>
        </h1>
        <div className="space-y-1">
          <p className="text-base sm:text-lg text-fg">Спортивная мафия онлайн</p>
          <p className="text-sm sm:text-base text-muted">Играйте с людьми со всего мира</p>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <Button onClick={onCreateLobby} size="lg">
            Создать лобби
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate(ROUTE_PATH.RULES)}>
            Как играть
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
// — no Vite import needed. A vertical mask fades the top + bottom of the
// image into the page bg so the rectangular crop doesn't read.
function SplashImage() {
  return (
    <div
      className="relative w-full aspect-[16/10] bg-no-repeat bg-center bg-cover"
      style={{
        backgroundImage: 'url(/splash-hero.png)',
        maskImage:
          'linear-gradient(to bottom, transparent 0%, black 18%, black 78%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0%, black 18%, black 78%, transparent 100%)',
      }}
      aria-hidden="true"
    />
  );
}
