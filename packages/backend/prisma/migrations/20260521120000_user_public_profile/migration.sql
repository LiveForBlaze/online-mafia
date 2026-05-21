-- User public-profile changes:
--   1. nickname is no longer unique — multiple players can share a display name.
--   2. publicCode is a new short stable identifier used for /u/:code URLs.
--   3. Optional public fields: realName, country, clubName.

-- Add new columns. publicCode is nullable at first so we can backfill it.
ALTER TABLE "User" ADD COLUMN "publicCode" TEXT;
ALTER TABLE "User" ADD COLUMN "realName" TEXT;
ALTER TABLE "User" ADD COLUMN "country" TEXT;
ALTER TABLE "User" ADD COLUMN "clubName" TEXT;

-- Backfill publicCode for existing users with a 6-char uppercase code.
-- md5(random()::text) is always available without extensions; the previous
-- gen_random_bytes() variant needed pgcrypto, which prod doesn't have on.
DO $$
DECLARE
  u RECORD;
  new_code TEXT;
BEGIN
  FOR u IN SELECT id FROM "User" WHERE "publicCode" IS NULL LOOP
    LOOP
      new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE "publicCode" = new_code);
    END LOOP;
    UPDATE "User" SET "publicCode" = new_code WHERE id = u.id;
  END LOOP;
END $$;

ALTER TABLE "User" ALTER COLUMN "publicCode" SET NOT NULL;
CREATE UNIQUE INDEX "User_publicCode_key" ON "User"("publicCode");

-- Drop the nickname uniqueness constraint.
DROP INDEX IF EXISTS "User_nickname_key";
