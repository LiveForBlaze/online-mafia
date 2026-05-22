-- Add the "Готов" toggle. Default false so existing rows are gated on the
-- host pressing-start until everyone explicitly opts in. The lobby UI flips
-- bots to true at insert time via application code; this migration only
-- introduces the column.
ALTER TABLE "LobbyMember" ADD COLUMN "isReady" BOOLEAN NOT NULL DEFAULT false;
