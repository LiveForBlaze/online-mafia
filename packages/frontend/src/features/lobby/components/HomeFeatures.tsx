// Four "selling points" rendered as an icon + label + body grid below the
// lobby list. Visually balances out the empty-state on the home page when
// no lobbies are open.

import { useTranslation } from 'react-i18next';
import { Globe, Shield, Trophy, Users, type LucideIcon } from 'lucide-react';

interface Feature {
  Icon: LucideIcon;
  key: 'worldwide' | 'fairPlay' | 'tournaments' | 'clubs';
}

const FEATURES: Feature[] = [
  { Icon: Globe, key: 'worldwide' },
  { Icon: Shield, key: 'fairPlay' },
  { Icon: Trophy, key: 'tournaments' },
  { Icon: Users, key: 'clubs' },
];

export function HomeFeatures() {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 pt-2">
      {FEATURES.map((f) => (
        <FeatureCard key={f.key} feature={f} />
      ))}
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const { t } = useTranslation();
  const { Icon } = feature;
  return (
    <div className="flex flex-col items-center text-center space-y-3 px-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h3 className="text-sm sm:text-base font-semibold text-fg">
        {t(`home.features.${feature.key}.title`)}
      </h3>
      <p className="text-xs sm:text-sm text-muted leading-snug">
        {t(`home.features.${feature.key}.body`)}
      </p>
    </div>
  );
}
