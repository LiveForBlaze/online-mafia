// Four "selling points" rendered as an icon + label + body grid below the
// lobby list. Visually balances out the empty-state on the home page when
// no lobbies are open.

interface Feature {
  icon: 'globe' | 'shield' | 'trophy' | 'people';
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: 'globe',
    title: 'Онлайн по всему миру',
    body: 'Играйте с реальными людьми из разных стран',
  },
  {
    icon: 'shield',
    title: 'Честная игра',
    body: 'Продвинутая система защиты от читеров',
  },
  {
    icon: 'trophy',
    title: 'Турниры и рейтинги',
    body: 'Участвуйте в турнирах и поднимайтесь в рейтинге',
  },
  {
    icon: 'people',
    title: 'Клубы и друзья',
    body: 'Создавайте клубы и играйте с друзьями',
  },
];

export function HomeFeatures() {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 pt-2">
      {FEATURES.map((f) => (
        <FeatureCard key={f.title} feature={f} />
      ))}
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div className="flex flex-col items-center text-center space-y-2 px-2">
      <div className="text-fg">
        <FeatureIcon kind={feature.icon} />
      </div>
      <h3 className="text-sm sm:text-base font-semibold text-fg">{feature.title}</h3>
      <p className="text-xs sm:text-sm text-muted leading-snug">{feature.body}</p>
    </div>
  );
}

function FeatureIcon({ kind }: { kind: Feature['icon'] }) {
  const common = {
    width: 36,
    height: 36,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (kind) {
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6c0 4.5-3.4 8.6-8 9-4.6-.4-8-4.5-8-9V6l8-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'trophy':
      return (
        <svg {...common} className="text-warning" stroke="currentColor">
          <path d="M8 4h8v4a4 4 0 0 1-8 0V4z" />
          <path d="M4 5h4v3a3 3 0 0 1-3 3H4V5zM20 5h-4v3a3 3 0 0 0 3 3h1V5z" />
          <path d="M10 12h4v3h-4zM9 19h6v-2H9z" />
        </svg>
      );
    case 'people':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.2" />
          <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <path d="M14 13.5c2.2 0 4 1.8 4 4V19" />
        </svg>
      );
  }
}
