-- Achievement ledger on User.
--
-- Stored as JSON array of `{ id, earnedAt }` rows. The catalog of
-- achievements lives in code (shared/constants/achievements.ts) and is
-- versioned together with the rest of the source — only the fact that
-- a particular user earned a particular id is persisted here.

ALTER TABLE "User"
  ADD COLUMN "achievements" JSONB NOT NULL DEFAULT '[]';
