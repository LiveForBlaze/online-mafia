// «Три шага» — секция про игровой цикл online-mafia. Большая backdrop-цифра
// 01/02/03 за каждой карточкой, текст спереди. Заменяет/дополняет 4-кнопочную
// HomeFeatures: HomeFeatures отвечает на «зачем вообще» (мировая база,
// fair-play, турниры, клубы), эта секция отвечает на «как это устроено».

import { useTranslation } from 'react-i18next';

const STEPS = ['lobby', 'roles', 'table'] as const;

export function HowItWorksSection() {
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-accent">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
          {t('howItWorks.kicker')}
        </p>
        <h2 className="text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-fg">
          {t('howItWorks.title')}
        </h2>
        <p className="text-sm text-muted max-w-xl">{t('howItWorks.subtitle')}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <StepCard key={step} step={step} index={i + 1} />
        ))}
      </div>
    </section>
  );
}

function StepCard({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const { t } = useTranslation();
  const num = String(index).padStart(2, '0');
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-card p-5 min-h-[200px]">
      {/* Backdrop digit — большая цифра подложкой, не отвлекает от текста. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1 text-[120px] font-extrabold leading-none text-fg/[0.04] select-none"
      >
        {num}
      </span>

      <p className="relative text-[10px] uppercase tracking-[0.18em] text-muted">
        <span
          aria-hidden="true"
          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent"
        />
        {num} · {t(`howItWorks.steps.${step}.kicker`)}
      </p>
      <h3 className="relative mt-2 text-lg font-bold uppercase tracking-tight text-fg">
        {t(`howItWorks.steps.${step}.title`)}
      </h3>
      <p className="relative mt-2 text-sm text-muted leading-relaxed">
        {t(`howItWorks.steps.${step}.body`)}
      </p>
    </article>
  );
}
