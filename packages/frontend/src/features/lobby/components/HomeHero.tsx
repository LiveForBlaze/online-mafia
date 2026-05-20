// Landing-style hero for the lobby list page. Big two-tone title, subtitle,
// primary + secondary CTAs, and an abstract globe-dots illustration on the
// right (placeholder until a real splash image gets dropped in).

import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/Button.js';
import { ROUTE_PATH } from '@/routes/paths.js';

interface HomeHeroProps {
  onCreateLobby: () => void;
}

export function HomeHero({ onCreateLobby }: HomeHeroProps) {
  const navigate = useNavigate();
  return (
    <section className="relative grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center py-6 sm:py-10">
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
        <HeroIllustration />
      </div>
    </section>
  );
}

// Placeholder splash — concentric dot-grid in accent colour. Reads as "a world
// of players" without committing to any particular artwork. Replace by a real
// PNG/SVG once available.
function HeroIllustration() {
  return (
    <div className="relative w-[360px] h-[360px]">
      <svg viewBox="0 0 400 400" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          <radialGradient id="globeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.36 0.14 20)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="oklch(0.36 0.14 20)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="180" fill="url(#globeGlow)" />
        {/* Concentric dot rings — sparse, fading outward. */}
        {[60, 100, 140, 180].map((r, ringIdx) => (
          <g key={r} opacity={1 - ringIdx * 0.18}>
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i / 24) * Math.PI * 2;
              const x = 200 + Math.cos(a) * r;
              const y = 200 + Math.sin(a) * r;
              return <circle key={i} cx={x} cy={y} r="2.2" fill="oklch(0.55 0.18 22)" />;
            })}
          </g>
        ))}
        {/* Centre M monogram placeholder — gets replaced by a real logo later. */}
        <text
          x="200"
          y="220"
          textAnchor="middle"
          fontSize="80"
          fontWeight="900"
          fill="oklch(0.95 0 0)"
          fontFamily="system-ui, sans-serif"
        >
          M
        </text>
      </svg>
    </div>
  );
}
