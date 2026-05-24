-- Lifetime user stats + idempotent finalize guard on Game.
--
-- All new columns default to safe zeros / `false`, so deploying this
-- migration on a live DB does not require backfill: every existing user
-- starts at 0 wins / 0 losses / 0 games-as-judge, and every existing
-- finished game is treated as «stats not yet applied». If we want to
-- retro-fill historical stats from `GameEvent`, that runs as a separate
-- one-off script later.

ALTER TABLE "User"
  ADD COLUMN     "wins"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "losses"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "gamesAsJudge" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "winsByRole"   JSONB   NOT NULL DEFAULT '{}';

ALTER TABLE "Game"
  ADD COLUMN     "statsApplied" BOOLEAN NOT NULL DEFAULT false;
