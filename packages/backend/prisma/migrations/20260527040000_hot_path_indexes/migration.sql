-- Индексы под горячие пути:
--
-- Lobby(status, createdAt) — покрывает:
--   * expireStaleLobbies   — WHERE status='WAITING' AND createdAt < cutoff
--   * listPublicLobbies    — WHERE status='WAITING' (фильтр + ORDER BY createdAt)
--   * getHomeStats         — COUNT WHERE status='WAITING'
--   * admin list-lobbies   — WHERE status='ACTIVE'/конкретный
-- Префикс status один сам по себе уже эффективен, но композит (status, createdAt)
-- даёт index-only-scan на самых частых запросах сортирующихся по createdAt.
--
-- User(isBot) — покрывает:
--   * cleanupOrphanBots    — WHERE isBot=true AND nested NOT EXISTS
--   * listUsersForAdmin    — WHERE isBot=false (дефолт)
-- На boolean-колонке B-tree-index слабее чем partial, но Prisma не умеет
-- partial. Postgres всё равно использует index-scan когда селективность высокая
-- (ботов ~30% от всех User'ов).

CREATE INDEX IF NOT EXISTS "Lobby_status_createdAt_idx" ON "Lobby" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "User_isBot_idx" ON "User" ("isBot");
