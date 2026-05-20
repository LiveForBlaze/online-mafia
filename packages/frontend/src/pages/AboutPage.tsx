// "О проекте" — миссия и цель платформы. Намеренно держим страницу
// content-first и без баннеров/кнопок: это сам по себе документ.

export function AboutPage() {
  return (
    <div className="p-4 sm:p-6">
      <article className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">online-mafia</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-fg">О проекте</h1>
          <p className="text-base text-muted">
            Открытая платформа для игры в спортивную мафию онлайн.
          </p>
        </header>

        <Section title="Цель">
          <p>
            Продвигать мафию как игру — её темп, психологию, командное мышление. Не как субкультуру
            и не как «закрытый клуб», а как доступное хобби, в которое могут сыграть любые десять
            человек, у которых есть браузер и желание провести вечер.
          </p>
        </Section>

        <Section title="Миссия">
          <p>
            Быть нейтральной площадкой: <strong className="text-fg">вне политики</strong>,
            <strong className="text-fg"> вне федераций</strong>, вне внутренних разборок
            мафия-сообщества. Мы не выдаём рейтинг для титулов, не примыкаем ни к одной ассоциации,
            не диктуем единственно «правильный» свод правил.
          </p>
          <p>
            Платформа — это инфраструктура, а не партия. Хосты ведут партии так, как им удобно;
            клубы и турниры — следующий шаг, но даже там мы не становимся арбитром «как правильно
            играть».
          </p>
        </Section>

        <Section title="Что это значит на практике">
          <ul className="list-disc pl-5 space-y-1.5 text-muted">
            <li>Никаких обязательных аккаунтов с верификацией от федераций.</li>
            <li>Базовые правила — классическая 10-местная мафия, но рулсеты подключаемые.</li>
            <li>Открытый код, MIT-лицензия. Любой может развернуть свою копию.</li>
            <li>Mainstream-стек: Node.js + React + WebRTC. Чтобы было кому развивать.</li>
          </ul>
        </Section>

        <Section title="Статус">
          <p>
            Сейчас идёт бета. Возможны баги, изменения и временные правки. Финальной версии продукта
            это пока не отражает — но базовый игровой цикл уже работает.
          </p>
        </Section>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg sm:text-xl font-semibold text-fg">{title}</h2>
      <div className="space-y-3 text-base text-muted leading-relaxed">{children}</div>
    </section>
  );
}
