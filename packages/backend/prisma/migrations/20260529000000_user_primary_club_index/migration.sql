-- Postgres does not auto-index foreign keys. User.primaryClubId is read when
-- rendering a user's primary club and scanned on the ON DELETE SET NULL path
-- when a club is deleted. Without this index both are seqscans on User.
-- IF NOT EXISTS keeps the migration idempotent across environments.
CREATE INDEX IF NOT EXISTS "User_primaryClubId_idx" ON "User"("primaryClubId");
