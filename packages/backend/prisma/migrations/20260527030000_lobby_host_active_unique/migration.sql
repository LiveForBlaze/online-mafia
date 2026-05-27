-- DB-уровневая защита от race condition в createLobby:
-- "один хост = одно активное лобби (WAITING ∪ IN_GAME)".
-- Раньше проверка делалась через findFirst + create без транзакции —
-- два параллельных POST /lobby оба проходили гейт и создавали по лобби.
--
-- Postgres partial unique index ловит это атомарно: вторая попытка
-- INSERT'a с тем же hostId и status ∈ {WAITING, IN_GAME} упадёт с P2002.
-- Приложение ловит и возвращает HOST_HAS_ACTIVE_LOBBY как обычно.
--
-- На случай если в БД уже есть duplicate (юзер успел создать 2 лобби до
-- релиза этой защиты) — sweeper к этому моменту должен был зачистить
-- большинство, но защитимся: явно закрываем дубликаты, оставляя самое
-- свежее активным.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "hostId"
           ORDER BY "createdAt" DESC
         ) AS rn
  FROM "Lobby"
  WHERE status IN ('WAITING', 'IN_GAME')
)
UPDATE "Lobby"
SET status = 'CLOSED'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX "Lobby_hostId_active_unique"
  ON "Lobby" ("hostId")
  WHERE status IN ('WAITING', 'IN_GAME');
