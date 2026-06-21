// «Что внутри» — карточки фич ниже секции «Три шага». Та же стилистика,
// что и `HowItWorksSection`: красный dot-kicker сверху, крупный
// uppercase-заголовок, 4 карточки одинаковой высоты с rounded-md иконкой
// в углу и текстом слева.
//
// Раньше был центрированный layout с круглыми accent-фоном иконками — но
// дизайнер показал left-aligned card-grid того же языка что и «Три шага»,
// и он лучше читается рядом с ней (две одинаковые секции дают visual
// rhythm, не конкурируют).

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
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.18em] text-accent">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
          {t('home.featuresKicker')}
        </p>
        {/* Заголовок ужат: раньше `md:text-4xl font-extrabold` перетекал
            в одну строку и спорил по тяжести с hero-словом «МАФИЯ».
            Теперь max-w-2xl даёт естественный перенос на ~2 строки и
            font-bold (вместо extrabold) ставит его весом ниже героя. */}
        <h2 className="max-w-2xl text-2xl sm:text-3xl font-bold uppercase tracking-tight text-fg">
          {t('home.featuresTitle')}
        </h2>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {FEATURES.map((f) => (
          <FeatureCard key={f.key} feature={f} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const { t } = useTranslation();
  const { Icon } = feature;
  return (
    <article className="hover-lift rounded-xl border border-border bg-card p-5 space-y-4 shadow-elev">
      {/* Accent-tinted icon coin — matches the «Три шага» step coins so the
          two grids read as one elevation/accent system. */}
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
        <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h3 className="text-sm font-bold uppercase tracking-tight text-fg">
        {t(`home.features.${feature.key}.title`)}
      </h3>
      <p className="text-sm text-muted leading-relaxed">{t(`home.features.${feature.key}.body`)}</p>
    </article>
  );
}
