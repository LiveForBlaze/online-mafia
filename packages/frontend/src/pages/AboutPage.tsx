// "О проекте" — миссия и цель платформы. Намеренно держим страницу
// content-first и без баннеров/кнопок: это сам по себе документ.

import { useTranslation } from 'react-i18next';

export function AboutPage() {
  const { t } = useTranslation();
  const practiceItems = t('about.practice.items', { returnObjects: true }) as string[];

  return (
    <div className="p-4 sm:p-6">
      <article className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            {t('about.kicker')}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-fg">
            {t('about.title')}
          </h1>
          <p className="text-base text-muted">{t('about.subtitle')}</p>
        </header>

        <Section title={t('about.goal.title')}>
          <p>{t('about.goal.body')}</p>
        </Section>

        <Section title={t('about.mission.title')}>
          <p>
            {t('about.mission.body1_prefix')}
            <strong className="text-fg">{t('about.mission.body1_strong1')}</strong>
            {t('about.mission.body1_middle')}
            <strong className="text-fg">{t('about.mission.body1_strong2')}</strong>
            {t('about.mission.body1_suffix')}
          </p>
          <p>{t('about.mission.body2')}</p>
        </Section>

        <Section title={t('about.practice.title')}>
          <ul className="list-disc pl-5 space-y-1.5 text-fg">
            {Array.isArray(practiceItems) &&
              practiceItems.map((item, idx) => <li key={idx}>{item}</li>)}
          </ul>
        </Section>

        <Section title={t('about.status.title')}>
          <p>{t('about.status.body')}</p>
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg sm:text-xl font-semibold text-fg">{title}</h2>
      <div className="space-y-3 text-base text-fg leading-relaxed">{children}</div>
    </section>
  );
}
