// «Три шага» — секция про игровой цикл online-mafia. Большая backdrop-цифра
// 01/02/03 за каждой карточкой, текст спереди + мини-иллюстрация под ним:
//   01 — превью лобби-листа (моноширинная таблица с подсвеченной строкой)
//   02 — стенка из 10 карт с раскрытыми ролями (мафия / шериф / дон / м)
//   03 — видео-сцена 5×2 с одной подсвеченной плиткой (текущий говорящий)
//
// Иллюстрации полностью CSS/SVG-free — никаких внешних ассетов, чтобы не
// раздувать bundle и не зависеть от загрузки image-ресурсов на первом
// экране после fold'а.

import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn.js';

const STEPS = ['lobby', 'roles', 'table'] as const;
type Step = (typeof STEPS)[number];

export function HowItWorksSection() {
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-[0.18em] text-accent">
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

function StepCard({ step, index }: { step: Step; index: number }) {
  const { t } = useTranslation();
  const num = String(index).padStart(2, '0');
  return (
    <article className="relative overflow-hidden rounded-xl border border-border bg-card p-5 flex flex-col gap-4 min-h-[280px]">
      {/* Backdrop digit — большая цифра подложкой, не отвлекает от текста. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1 text-[120px] font-extrabold leading-none text-fg/[0.04] select-none"
      >
        {num}
      </span>

      <div className="relative space-y-2">
        <p className="text-2xs uppercase tracking-[0.18em] text-muted">
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent"
          />
          {num} · {t(`howItWorks.steps.${step}.kicker`)}
        </p>
        <h3 className="text-lg font-bold uppercase tracking-tight text-fg">
          {t(`howItWorks.steps.${step}.title`)}
        </h3>
        <p className="text-sm text-muted leading-relaxed">{t(`howItWorks.steps.${step}.body`)}</p>
      </div>

      <div className="relative mt-auto" aria-hidden="true">
        {step === 'lobby' && <LobbyPreview />}
        {step === 'roles' && <RoleWallPreview />}
        {step === 'table' && <VideoStagePreview />}
      </div>
    </article>
  );
}

// 01 — превью лобби-листа. Моноширинная стилизация под terminal: каждая
// строка — короткий id, имя стола, индикатор заполненности. Средняя строка
// «выбрана» — bg чуть светлее + бордер слева. Подразумевает, как читается
// настоящий список столов на главной.
function LobbyPreview() {
  const rows = [
    { id: '1234', name: 'Tbilisi #4', count: '9/10', tone: 'warning' as const },
    { id: '1235', name: 'Quiet table', count: '7/10', tone: 'success' as const, selected: true },
    { id: '1236', name: 'Blitz 7m', count: '6/10', tone: 'success' as const },
  ];
  return (
    <div className="rounded-md border border-border bg-card-deep/60 p-2 font-mono text-2xs">
      {rows.map((r) => (
        <div
          key={r.id}
          className={cn(
            'flex items-center gap-2 px-2 py-1 rounded-sm transition-colors',
            r.selected ? 'bg-bg/60 border-l-2 border-accent text-fg' : 'text-muted',
          )}
        >
          <span className="opacity-60">#{r.id}</span>
          <span className="opacity-60">·</span>
          <span className="truncate flex-1">{r.name}</span>
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full',
              r.tone === 'warning' ? 'bg-warning' : 'bg-success',
            )}
          />
          <span className={r.selected ? 'text-fg' : 'text-muted'}>{r.count}</span>
        </div>
      ))}
    </div>
  );
}

// 02 — стенка из 10 карт распределения ролей. 5×2 сетка, символы — первые
// буквы ролей. На «открытых» картах подсвечивается бордер цветом команды:
//   красный — Дон (Д) и Мафия (M)
//   нейтральный тёмно-серый (team-black) — Шериф (Ш)
//   серый — Мирные (М) [нет бордера]
// Раскладка ролей точно такая же, как в ФИИМ-партии: 1 дон + 1 шериф + 2
// мафии + 6 мирных.
function RoleWallPreview() {
  type Cell = { label: string; reveal: 'don' | 'sheriff' | 'mafia' | null };
  const cells: Cell[] = [
    { label: 'М', reveal: null },
    { label: 'М', reveal: null },
    { label: 'Д', reveal: 'don' },
    { label: 'Ш', reveal: 'sheriff' },
    { label: 'М', reveal: null },
    { label: 'М', reveal: 'mafia' },
    { label: 'М', reveal: null },
    { label: 'М', reveal: null },
    { label: 'М', reveal: 'mafia' },
    { label: 'М', reveal: null },
  ];
  const cellClass = (c: Cell) =>
    cn(
      'flex items-center justify-center rounded-sm h-8 text-xs font-semibold transition-colors',
      'bg-card-deep border',
      c.reveal === 'don' && 'border-accent text-accent',
      c.reveal === 'mafia' && 'border-accent/70 text-accent',
      c.reveal === 'sheriff' && 'border-team-black text-fg/80 bg-team-black/40',
      c.reveal === null && 'border-border text-muted',
    );
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {cells.map((c, i) => (
        <div key={i} className={cellClass(c)}>
          {c.label}
        </div>
      ))}
    </div>
  );
}

// 03 — видео-сцена. 5×2 тёмно-коричневые плитки (имитация LiveKit-стола в
// dim-свете). Одна плитка горит accent-красным — текущий говорящий. Прямой
// визуальный echo того, что юзер увидит, попав в игровую комнату.
function VideoStagePreview() {
  const ACTIVE_SEAT = 3; // 0-indexed; верхний правый край-ish — куда «смотрит» взгляд
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'aspect-[5/4] rounded-sm',
            i === ACTIVE_SEAT
              ? 'bg-gradient-to-br from-accent/40 to-accent/10 ring-1 ring-accent/60'
              : 'bg-gradient-to-br from-card-deep to-card-deep/40 ring-1 ring-border/40',
          )}
        />
      ))}
    </div>
  );
}
