<div align="center">

# 🎭 online-mafia

**Спортивная мафия онлайн — открытый проект для всех.**

Веб-платформа для классической мафии 10×1 (6 мирных, 1 шериф, 2 мафии, 1 дон)
с встроенным WebRTC видео и аудио. По правилам ФИИМ, но без федеративных
заборов: запустил у себя — играй.

[Play](https://online-mafia.com) · [Architecture](./docs/architecture.md) · [Game rules](./docs/game-engine.md) · [Contributing](./CONTRIBUTING.md)

</div>

---

## ✨ Что внутри

- **Полный игровой движок** — 14 фаз, FSM, проверки шерифа/дона, перестрелка,
  подъём, «лучший ход» (ЛХ), фолы и автокилл единственного кандидата по ФИИМ.
- **Встроенное видео и аудио** — LiveKit, per-viewer audio gating, AEC по
  умолчанию, push-on-reconnect, кнопка перезапуска зависшего стрима.
- **Открытое голосование** — все видят кто за кого, в реальном времени.
- **Судейские инструменты** — единая кнопка «Дальше» + Space-хоткей,
  «Назад» откатывает последний шаг, тогл «слышать всё / только процесс»,
  «−Фол» от случайного клика.
- **Аутентификация** — Email + Google OAuth (PKCE), Argon2id, soft-delete
  с анонимизацией.
- **Мульти-язычность** — RU/EN/UK/BE/KK/KA (часть переводов в работе).
- **Боты** — заполнить пустые места для тренировки.
- **OSS** — MIT, self-hostable, классический Node/React стек, никаких
  закрытых API. Pull-request'ы приветствуются.

## 🛠 Технологии

```
backend     Node 22 · Fastify 5 · Socket.IO · Prisma · Postgres · Redis
frontend    React 19 · Vite · Tailwind v4 · Zustand · React Query · LiveKit
shared      TypeScript types · zod schemas
realtime    LiveKit (audio + video)
infra       Docker Compose · Caddy (TLS reverse proxy)
```

Один git-репозиторий, три pnpm-пакета.

## 🚀 Запуск локально

```bash
# 1) поднимаем postgres + redis + livekit
docker compose up -d

# 2) ставим зависимости
pnpm install

# 3) применяем миграции
pnpm --filter @mafia/backend exec prisma migrate dev

# 4) запускаем backend + frontend параллельно
pnpm dev
```

После старта:

- frontend → http://localhost:5173
- backend → http://localhost:3000
- livekit → ws://localhost:7880

## 🧪 Тесты и проверки

```bash
pnpm run typecheck       # TS на всех пакетах
pnpm run test            # vitest (75/75 на engine)
pnpm run build           # production-bundle
pnpm run format          # prettier — обязательно перед коммитом
```

## 🗂 Структура

```
.
├── packages/
│   ├── shared/                 Типы, zod-схемы, константы фаз/ролей
│   ├── backend/
│   │   ├── prisma/             schema + migrations
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── auth/       Email + Google OAuth, сессии
│   │       │   ├── lobby/      Создать / зайти / выйти / закрыть
│   │       │   ├── game/       Чистый движок + сервис + сокет-гейт
│   │       │   └── users/      Профили
│   │       ├── plugins/        Fastify-плагины (security, socketio…)
│   │       └── lib/            mutex, logger, password, moderation
│   └── frontend/
│       └── src/
│           ├── features/
│           │   ├── auth/       Логин/Гугл/удаление аккаунта
│           │   ├── lobby/      Список / комната / чат
│           │   └── game/
│           │       ├── components/        Стол, тайлы, оверлеи
│           │       │   └── phases/        Подкомпоненты по фазам игры
│           │       ├── hooks/             useGameConnection, useCountdown, …
│           │       ├── lib/               media-visibility, actionForSeat
│           │       └── store/             zustand game store
│           ├── components/     UI kit (Button, Dialog, Avatar, …)
│           └── i18n/           Локализации
├── docs/                       Подробная документация ↓
├── docker-compose.yml          dev
├── docker-compose.prod.yml     prod
└── infra/                      Caddyfile + livekit.yaml
```

## 📚 Документация

| Где                                            | О чём                                              |
| ---------------------------------------------- | -------------------------------------------------- |
| [docs/architecture.md](./docs/architecture.md) | Топология, пакеты, потоки данных                   |
| [docs/game-engine.md](./docs/game-engine.md)   | FSM фаз, правила ФИИМ, как добавить новую механику |
| [docs/lobby.md](./docs/lobby.md)               | Lifecycle лобби, broadcasts, auto-evict            |
| [docs/media.md](./docs/media.md)               | LiveKit, видимость/аудибилити, эхо/AEC             |
| [docs/auth.md](./docs/auth.md)                 | Сессии, OAuth, revocation, soft-delete             |

## 🎯 Roadmap

Текущая версия — **альфа**. То что точно сделаем:

- [ ] Турниры и таблицы рейтинга
- [ ] Клубы (private leagues)
- [ ] Статистика партий
- [ ] Mobile-приложение (нативное)
- [ ] Спикер-индикатор громкости
- [ ] Push-to-talk для судьи

Открытые баг-репорты и фичи — issues приветствуются.

## 🤝 Contributing

См. [CONTRIBUTING.md](./CONTRIBUTING.md). Главное:

- Один файл = одна ответственность. Перед merge — `pnpm run format`.
- Engine тесты обязательны при изменении правил (см.
  [game-engine.md](./docs/game-engine.md) раздел «Adding a new rule»).
- Безопасность: никаких секретов в коммитах, никаких изменений auth без
  обоснования.

## 📄 License

MIT — см. [LICENSE](./LICENSE). Делайте форк, разворачивайте у себя,
улучшайте. Единственная просьба — если вернётесь с улучшениями, шлите
PR обратно. Это полезно всему сообществу.

## 🙏 Спасибо

Проект существует благодаря OSS-сообществу: LiveKit, Fastify, Prisma,
Vite, React, Tailwind, Socket.IO, arctic, argon2, zod — все они на ваших
плечах.

---

<div align="center">

⭐ Если идея проекта откликается — ставьте звезду на репозиторий.

</div>
