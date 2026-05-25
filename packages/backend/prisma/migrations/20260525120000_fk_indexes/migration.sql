-- Add explicit indexes on hot foreign keys.
--
-- Postgres does NOT auto-index foreign-key columns the way MySQL InnoDB
-- does. Without these, every "all lobbies of this user", "all games of this
-- user", "all lobbies this user hosts" lookup does a seq scan over the
-- whole table. These are CREATE INDEX IF NOT EXISTS so the migration is
-- safe to re-apply if it lands twice (defence against the P3018 scar).
--
-- All three are purely additive and reversible (`DROP INDEX`).

CREATE INDEX IF NOT EXISTS "LobbyMember_userId_idx" ON "LobbyMember"("userId");
CREATE INDEX IF NOT EXISTS "GameParticipant_userId_idx" ON "GameParticipant"("userId");
CREATE INDEX IF NOT EXISTS "Lobby_hostId_idx" ON "Lobby"("hostId");

-- Leaderboard / players-directory sort: ORDER BY wins DESC, gamesPlayed DESC.
-- Composite index has wins first so even queries that only sort by wins
-- still use it via prefix scan. Filtered queries (`WHERE isBot = false`)
-- benefit too once selectivity is high enough.
CREATE INDEX IF NOT EXISTS "User_wins_gamesPlayed_idx" ON "User"("wins", "gamesPlayed");
