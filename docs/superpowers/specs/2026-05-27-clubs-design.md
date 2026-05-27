# Clubs — design spec

**Status:** approved for implementation
**Date:** 2026-05-27
**Replaces:** `User.clubName` free-text field

## Goal

Игроки могут создавать клубы (creator → head) и подавать заявки на вступление. Глава клуба одобряет/отклоняет заявки, может кикать членов, передавать лидерство, переименовывать и распускать клуб. Юзер может состоять в нескольких клубах одновременно; в профиле он выбирает один для отображения (primary), по умолчанию — самый новый.

Существующее текстовое поле `User.clubName` дропается. Имеющиеся значения теряются — это alpha-проект, потерь немного.

## Data model

```prisma
model Club {
  id          String   @id @default(uuid())
  name        String   @unique           // глобально уникальное (case-sensitive UNIQUE; FE ищет ILIKE)
  publicCode  String   @unique           // 6-char alphanumeric, аналог User.publicCode → /clubs/:code
  headId      String                     // FK User, ровно один head
  head        User     @relation("ClubHead", fields: [headId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members       ClubMember[]
  joinRequests  ClubJoinRequest[]

  @@index([headId])
}

model ClubMember {
  clubId    String
  club      Club     @relation(fields: [clubId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  joinedAt  DateTime @default(now())

  @@id([clubId, userId])
  @@index([userId])
}

model ClubJoinRequest {
  clubId      String
  club        Club     @relation(fields: [clubId], references: [id], onDelete: Cascade)
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  requestedAt DateTime @default(now())

  @@id([clubId, userId])
  @@index([clubId])
  @@index([userId])
}

model User {
  // ... existing
  // REMOVED: clubName String?
  // ADDED:
  primaryClubId      String?
  primaryClub        Club?              @relation("UserPrimaryClub", fields: [primaryClubId], references: [id], onDelete: SetNull)
  headOfClubs        Club[]             @relation("ClubHead")
  clubMemberships    ClubMember[]
  clubJoinRequests   ClubJoinRequest[]
}
```

**Cascade/onDelete policy:**

| FK                              | onDelete           | Why                                                                                                                |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `ClubMember.userId/clubId`      | Cascade            | юзер/клуб исчезает → membership уходит                                                                             |
| `ClubJoinRequest.userId/clubId` | Cascade            | то же для заявок                                                                                                   |
| `User.primaryClubId`            | SetNull            | удалили клуб → у юзера просто пропадает display-выбор                                                              |
| `Club.headId`                   | Restrict (default) | нельзя удалить юзера-главу пока он head. Защита кода: на удалении юзера сначала auto-transfer / delete его клубов. |

**Application-level invariants** (не в БД, в коде):

- Юзер не может одновременно быть в `ClubMember` И `ClubJoinRequest` для одного клуба
- `Club.headId` всегда указывает на юзера который ЕСТЬ в `ClubMember` этого клуба
- При `leaveClub` где `userId === headId`: транзакционно auto-transfer на старейшего active member (по joinedAt). Если других нет — клуб удаляется.
- **Юзер может состоять не более чем в `MAX_CLUBS_PER_USER = 3` клубах одновременно.** Это лимит на `ClubMember` rows, не на pending requests. Проверяется в:
  - `createClub` — отказ если у создателя уже 3 active membership (он сразу станет 4-м, как member нового клуба)
  - `submitJoinRequest` — превентивный отказ, чтобы не плодить бесполезные заявки
  - `approveJoinRequest` — повторная проверка для target (race-safe: между submit и approve юзер мог апрувнуться в другие)

**`primaryClubId` логика чтения:**

1. Если `primaryClubId IS NOT NULL` И юзер active member этого клуба → используем
2. Иначе fallback на newest `ClubMember.joinedAt` для этого юзера
3. Если у юзера нет active memberships → `null` (FE: поле скрыто)

## Backend API

`/api/v1/clubs/*` endpoints. Все требуют `app.authenticate`. Мутирующие также имеют `requireRestrictionNotSet(EDIT_PROFILE)` — клуб это часть профиля.

| Method | Path                           | Body                         | Auth                | Description                                                                                                            |
| ------ | ------------------------------ | ---------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/clubs`                       | —                            | auth                | List with `?search` + `?offset` + `?limit`. Returns `{ clubs: ClubSummary[], total }`                                  |
| GET    | `/clubs/:code`                 | —                            | auth                | Detail. Returns `{ club: ClubDetails }`. Includes `joinRequests` ТОЛЬКО если viewer = head.                            |
| POST   | `/clubs`                       | `{ name }`                   | auth + EDIT_PROFILE | Create. Moderation. Creator → head + member. Returns `{ club: ClubDetails }`.                                          |
| PATCH  | `/clubs/:code`                 | `{ name }`                   | auth + head         | Rename, moderation.                                                                                                    |
| DELETE | `/clubs/:code`                 | —                            | auth + head         | Disband. Cascade.                                                                                                      |
| POST   | `/clubs/:code/join`            | —                            | auth + EDIT_PROFILE | Submit join request. Errors: `already_member`, `already_pending`.                                                      |
| POST   | `/clubs/:code/leave`           | —                            | auth + member       | Leave. Если head + другие active → auto-transfer на старейшего. Если один → delete club.                               |
| POST   | `/clubs/:code/transfer`        | `{ newHeadId }`              | auth + head         | Явная передача лидерства. Target должен быть active member.                                                            |
| POST   | `/clubs/:code/approve`         | `{ userId }`                 | auth + head         | Tx: DELETE Request + INSERT Member.                                                                                    |
| POST   | `/clubs/:code/reject`          | `{ userId }`                 | auth + head         | DELETE Request.                                                                                                        |
| POST   | `/clubs/:code/cancel-request`  | —                            | auth + pending      | Юзер отзывает свою заявку.                                                                                             |
| DELETE | `/clubs/:code/members/:userId` | —                            | auth + head         | Kick member. Если `targetUserId === headId` → 409 `cannot_kick_head` (head убирается только через Leave или Transfer). |
| PATCH  | `/auth/me/primary-club`        | `{ clubId: string \| null }` | auth                | Set/clear primary. Сервер валидирует что юзер active в этом клубе.                                                     |

**Error codes** (`CLUB_ERROR` constant в `shared/constants/clubs.ts`):
`not_found`, `name_taken`, `name_rejected`, `not_member`, `not_head`, `not_pending`, `already_member`, `already_pending`, `target_not_member`, `cannot_kick_head`, `max_clubs_reached`, `target_max_clubs_reached`.

HTTP mapping (см. `lobby.routes.ts:lobbyErrorToHttpStatus` как образец):

- `not_found` → 404
- `name_rejected` → 400
- `not_head`, `not_member` → 403
- `name_taken`, `already_member`, `already_pending`, `not_pending`, `target_not_member`, `cannot_kick_head`, `max_clubs_reached`, `target_max_clubs_reached` → 409

**Rate-limits** (per-user через `keyGenerator: request.user.sub`):

- `POST /clubs` — 5 / day (anti-spam, как `POST /lobby`)
- `POST /clubs/:code/join` — 30 / day (защита от бот-спама заявок)
- Остальные мутации полагаются на глобальный 200/min

**Sockets:** не нужны в MVP. Все обновления через react-query refetch. Если позже нужно "глава видит свежую заявку моментально" — добавим SERVER_EVENT и broadcast в комнату club:`<id>`.

## Frontend

**Routes:**

- `/clubs` — list page (заменяет `ComingSoon` заглушку)
- `/clubs/:code` (NEW) — club detail page
- `/user` (`UserPage`) — обновляется dropdown'ом primary-club

**`/clubs` (ClubsListPage):**

- Header: title + search box (debounced 300ms) + `+ Создать клуб` button
- Grid карточек (paginated через "Загрузить ещё", PAGE_SIZE=50)
- Per-card: club name, member count, head nickname, action-кнопка зависящая от состояния viewer'а:
  - Не член, no pending → **Войти** (primary CTA)
  - Pending → **Заявка отправлена** (disabled secondary)
  - Member → **В клубе** (secondary)
  - Head → **Вы глава** (accent)
- Click на карточку (anywhere except action button) → `/clubs/:code`
- `+ Создать клуб` → modal с input для name. Submit → POST `/clubs` → navigate в `/clubs/:newCode`

**`/clubs/:code` (ClubDetailPage):**

- Header: club name (с ✎ inline-edit для head, ✓/✕ кнопки — как админ-rename), member count, дата создания
- "Members" секция: список с avatar + nickname + (Глава)-badge на head + 🗑 kick на не-head'ов (только если viewer = head)
- "Заявки" секция (head-only): list с ✓ Одобрить / ✕ Отклонить per row. Скрыта если pendingCount = 0.
- Viewer action zone (внизу карточки):
  - Не член, no pending → **Подать заявку** (primary)
  - Pending → текст "Заявка на рассмотрении" + **Отозвать заявку**
  - Member (не head) → **Покинуть клуб**
  - Head с членами → **Передать лидерство** (dialog) + **Распустить клуб** (danger zone)
  - Head один → **Распустить клуб**

**ConfirmDialog'и** (reuse существующий):

- Leave (когда head с другими — предупреждение про auto-transfer)
- Disband club
- Kick member
- Transfer leadership (single dialog с member-select dropdown + apply)

**Profile (`UserPage` `OwnProfileSection`):**

- Удаляю `<FormField label="Клуб">` с free-text input
- Если `user.clubs.length === 0` → секция клуба не рендерится; вместо неё CTA "Найти клуб →" linking на `/clubs`
- Иначе `<select>` "Отображаемый клуб":
  - Options: каждый active membership + "Не отображать" (clears primaryClubId)
  - Default value: `user.primaryClubId` (через API) или newest membership (вычисляется на сервере, отдаётся как hint)
- Save form вызывает PATCH `/auth/me/primary-club` если значение dirty

**PlayersPage column "Клуб":**

- Server-side: `listPublicUsers` отдаёт `primaryClubName: string | null` (computed: primary → fallback newest)
- FE: тот же `{user.primaryClubName ?? '—'}` — нужно переименовать field в shared schema

**Toast (через существующий `Toaster`)** для всех мутаций success/error.

**`AuthenticatedUser` schema additions** (shared):

- `clubMemberships: { clubId, clubName, clubCode, isHead, joinedAt }[]` — для рендера dropdown'а и определения "вы глава"
- `clubJoinRequests: { clubId, clubName, clubCode }[]` — для статуса pending на /clubs

**`PublicUserProfile` schema changes:**

- `clubName` → `primaryClubName` (computed)

## Migration

`prisma/migrations/20260527050000_clubs/migration.sql`:

1. Create `Club`, `ClubMember`, `ClubJoinRequest` tables с индексами
2. `ALTER TABLE "User" ADD COLUMN "primaryClubId" ... ON DELETE SET NULL`
3. `ALTER TABLE "User" DROP COLUMN "clubName"`

Prisma поднимет `db:generate`, типы автообновятся в `@prisma/client`.

## Moderation

`moderateName(name, 'club')` (kind `'club'` уже в `ModerationKind` type). Тот же flow:

1. Prefilter (RU мат + bypass-паттерны) — `lib/moderation-prefilter.ts`
2. Haiku call с тем же system prompt (упоминает "mafia platform")
3. На rejection → 400 `name_rejected`

Apply в: `createClub`, `renameClub`. Junk-имена не пропустит та же стена что и для лобби/никнеймов.

## Edge cases

| Case                                                | Resolution                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Юзер удаляется (admin/self), head нескольких клубов | Расширить `deleteOwnAccount` и `deleteUserAsAdmin`: для каждого `headId = userId` клуба — auto-transfer или delete. Затем cascade убирает member-rows. |
| Head approves заявку которую юзер отозвал           | `findUnique(ClubJoinRequest)` вернёт null → 404 `not_pending`. Toast.                                                                                  |
| Transfer на юзера который только что вышел          | В транзакции проверяем target существует в `ClubMember`; иначе 409 `target_not_member`.                                                                |
| Concurrent kick + leave                             | Оба `DELETE` на одну строку. Один успевает первым, другой → P2025 → 404 `not_member`. Idempotent.                                                      |
| `primaryClubId` указывает на клуб откуда юзер вышел | `leaveClub` явно затирает `primaryClubId` у уходящего если он = leaving clubId. Не остаётся битой ссылки до следующего query-time fallback.            |
| Concurrent approve + head transfer                  | Оба берут транзакцию на Club row. Postgres MVCC сериализует. Каждый action возвращает консистентный error code, state не корраптится.                  |
| Создание клуба с уже занятым именем                 | P2002 на unique constraint → 409 `name_taken`.                                                                                                         |

## Tests

Backend (`vitest`):

- `clubs.service.test.ts` — 2 unit-теста с Prisma mocked:
  - `createClub` happy path: моderation passes → club created → creator is head + member
  - `leaveClub` as head with members: auto-transfer на старейшего active
- Service tests с реальной БД отложены — проект пока без integration-suite traditional, добавлять инфру под одну фичу overkill.

Frontend: тестов в проекте нет (`--passWithNoTests`). Manual smoke test:

- Create → see in list → open detail → ok
- Other user joins → head sees pending → approves → joining user now active
- Leave as head with members → leadership transferred
- Profile dropdown reflects memberships

## i18n

Новый блок `clubs.*` в RU + перевод на en/uk/be/kk/ka. Ключи:

- `clubs.title`, `clubs.subtitle`, `clubs.createCta`
- `clubs.search.placeholder`, `clubs.list.empty`
- `clubs.actions.join`, `clubs.actions.pending`, `clubs.actions.member`, `clubs.actions.head`
- `clubs.detail.members`, `clubs.detail.requests`, `clubs.detail.foundedOn`
- `clubs.actions.leave`, `clubs.actions.disband`, `clubs.actions.transfer`, `clubs.actions.kick`, `clubs.actions.approve`, `clubs.actions.reject`, `clubs.actions.cancelRequest`
- `clubs.confirm.leaveAsHeadTitle`, `clubs.confirm.leaveAsHead`
- `clubs.confirm.disbandTitle`, `clubs.confirm.disband`
- `clubs.confirm.kickTitle`, `clubs.confirm.kick`
- `clubs.confirm.transferTitle`, `clubs.confirm.transfer`
- `clubs.create.dialogTitle`, `clubs.create.namePlaceholder`
- `clubs.errors.*` (по error codes)
- `profile.primary_club.label`, `profile.primary_club.none`, `profile.primary_club.cta_no_clubs`

## Out of scope (defer to future)

- Club description / banner / logo
- Public club leaderboard / page-level stats
- Club chat
- Club tournaments / inter-club matches
- Per-club rating
- Admin tab "Клубы" в админ-панели (пока — прямой SQL если что-то требует ручного вмешательства)
- Realtime push для head заявок (сейчас — refetch react-query)

## Memory updates

После релиза сохранить в memory:

- `decision_clubs_module.md` — junction-table design + approval flow + primary-club semantics
- update `MEMORY.md` index
