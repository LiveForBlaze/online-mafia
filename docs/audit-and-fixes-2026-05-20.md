# Аудит и автоматические исправления — 2026-05-20

Сводка по полному аудиту проекта (5 параллельных агентов: архитектура,
безопасность, игровая логика, UX/a11y, production readiness) и пакету
исправлений, применённых в той же сессии.

---

## ✅ Что сделано автоматически

### 🎮 Критические баги игровой логики

- Мафия не может стрелять в свою команду — `applyMafiaTarget` отвергает MAFIA/DON цели
- Дон/шериф не могут проверять мёртвых и не могут проверять себя
- Запрет самономинации — больше нет патовых ситуаций («один кандидат = он сам»)
- Race condition исправлен — `withLock(gameId)` через `packages/backend/src/lib/mutex.ts`
  сериализует все мутации одной игры (параллельные голосования больше не теряются)
- Recovery восстанавливает спикера — новое событие `speaker_advanced` пишется
  в `judgeAdvanceSpeaker` и проигрывается при restart

### 🔒 Безопасность

- `@fastify/rate-limit` подключён (200 req/min на IP, в перспективе можно
  ужесточить per-route на `/auth/*`)
- Logger с `redact` для cookies, tokens, passwords (pino redact)
- **OAuth account-linking защита**: если существует password-аккаунт с этим
  email но `emailVerified=false`, привязка Google отказывается с типизированной
  ошибкой `oauth_link_refused`
- Новые поля `User.emailVerified` и `User.tokenVersion` в Prisma schema
- Lobby Socket.IO membership check — нечлен лобби не может подписаться
  на обновления приватного лобби
- `.env.example` с `CHANGE_ME_*` placeholders
- Backend отказывается стартовать в production:
  - с placeholder секретами в JWT_SECRET / LIVEKIT_API_SECRET
  - без `https://` в PUBLIC_BACKEND_URL
  - без `wss://` в LIVEKIT_URL
- Auth error switch с `never`-exhaustiveness check

### 🛠 Архитектура / надёжность

- SIGTERM/SIGINT handler в `index.ts` — graceful shutdown с `prisma.$disconnect()`
- CORS в production указывает на `FRONTEND_URL` (был баг — указывал на backend URL)
- `/health/ready` endpoint с проверкой Postgres (отдельно от `/health` liveness)
- `trustProxy: true` в production (для корректного `request.ip` за Caddy)
- Удалён dead code: `MediaControlBar.tsx`, `SeatTile.tsx`, `PHASE_AFTER_NIGHT`

### 🎨 UX / a11y

- `Dialog`: focus trap, `aria-labelledby`, restore focus при закрытии
- `ConfirmDialog` primitive — для kick / close lobby
- `LobbyRoomPage` loading state теперь показывает «Загрузка лобби...» а не текст ошибки
- `MediaRoom` error не убирает игровое UI — показывает баннер вверху,
  дети рендерятся (игра продолжается без видео)

### 🏗 Production-инфраструктура

- `packages/backend/Dockerfile` (multi-stage, non-root)
- `packages/frontend/Dockerfile` + `nginx.conf` (SPA fallback)
- `docker-compose.prod.yml` (TLS, restart policies, bind 127.0.0.1 для Postgres/Redis)
- `infra/Caddyfile` (Let's Encrypt автоматический)
- `infra/livekit.yaml` (production LiveKit config с TURN)
- `infra/deploy.md` (полный deploy-гайд)
- `scripts/backup.sh` (Postgres dump + rclone offsite опция)
- `.github/workflows/ci.yml` (format/typecheck/test/build)
- `SECURITY.md` (threat model + disclosure address)
- `CONTRIBUTING.md` (setup, code style, workflow)

### ✅ Тесты

- `vitest.config.ts` настроен
- `game.engine.test.ts` — **17 тестов проходят**:
  - role assignment (6/1/2/1 split корректен)
  - win conditions (BLACK при равенстве, RED только при aliveBlack===0)
  - self-nomination запрет
  - запрет нацеливания на мёртвых
  - запрет двойного голосования
  - запрет friendly fire мафии
  - запрет self-check дона/шерифа
  - vote resolution (majority + tie)

---

## 👤 Что осталось сделать вручную

### 🚫 Блокеры перед production деплоем

1. **Сгенерировать настоящие секреты** в `.env`:

   ```bash
   openssl rand -base64 48    # → JWT_SECRET
   openssl rand -base64 32    # → LIVEKIT_API_SECRET
   openssl rand -hex 24       # → POSTGRES_PASSWORD
   openssl rand -hex 16       # → REDIS_PASSWORD
   ```

2. **Купить домен** и направить A/AAAA на VPS. Минимум 3 поддомена:
   - `<домен>` для frontend
   - `api.<домен>` для backend
   - `livekit.<домен>` для медиа

3. **В `infra/Caddyfile`** заменить `mafia.example.com` на свой домен (3 места).

4. **В `infra/livekit.yaml`** заменить домен и `CHANGE_ME_LIVEKIT_API_SECRET_…`.

5. **Создать первую Prisma миграцию**:

   ```bash
   pnpm --filter @mafia/backend prisma migrate dev --name initial
   git add packages/backend/prisma/migrations
   ```

   В проде использовать `prisma migrate deploy` (прописано в deploy.md).

6. **Google OAuth Client** (если оставляем кнопку Google):
   - https://console.cloud.google.com/apis/credentials
   - Authorized redirect URI: `https://api.<домен>/api/v1/auth/google/callback`
   - Client ID + Secret в `.env`

### 🔧 Желательно до публичного запуска

7. **Sentry**: завести 2 проекта, подключить `@sentry/node` и `@sentry/react`
8. **UptimeRobot**: мониторинг `https://api.<домен>/health/ready`
9. **Email-сервис** (Postmark/SendGrid free tier) — нужен для пункта 11 ниже
10. **ESLint flat config** с `typescript-eslint` + `eslint-plugin-react`

### 📐 Спортивные правила (доработать после первого запуска)

11. **Email verification + password reset flow** — без этого защита #5 работает наполовину
12. **Последнее слово** — `DAY_LAST_WORD` фаза уже в schema, добавить переход в `applyAdvancePhase`
13. **Переголосование при ничьей** — `DAY_REVOTE` + `DAY_SHOOTOUT`
14. **Эскалация фолов** — на 3-м блокировать речь, на 4-м удалять
15. **Голосование внутри мафии за цель** — кворум команды вместо «последний клик»

### 🎨 UX-полировка

16. **Mobile portrait fallback** — на узком экране 4×3 даёт мелкие тайлы
17. **Confirmation на judge remove player** в `JudgePanel`
18. **Touch-таргеты ≥40px** — `h-7` поднять до `h-10` для мобилок
19. **aria-live регион** для phase announcements (screen readers)

### 🔮 Будущее (не сейчас)

- ELO/Glicko рейтинг
- Турниры (расписание/жеребьёвка/таблицы)
- Replay UI из event log (события уже пишутся в БД)
- Native iOS+Android
- Multi-ruleset через YAML

---

## Текущее состояние проекта

- **Локально полностью играбельно** — все игровые баги исправлены
- **К production деплою готова инфра** — Dockerfile, compose, Caddy, CI.
  Нужно только пункты 1–6 выше
- **Безопасность**: critical-замечания аудита покрыты (кроме email
  verification flow — нужен email-провайдер)
- **Тестовое покрытие**: только `game.engine.ts` (17 кейсов). Желательно
  ещё покрыть recovery и сервис-слой
- **`pnpm typecheck` и `pnpm test` зелёные на всех 3 пакетах**
