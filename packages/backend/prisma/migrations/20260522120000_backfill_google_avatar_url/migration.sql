-- Backfill googleAvatarUrl for users who linked Google before the column existed.
-- Before this column was added, findOrCreateUserFromGoogle wrote the Google
-- photo URL straight into avatarUrl on first sign-in. For anyone who still has
-- googleId set, an http-prefixed avatarUrl is almost certainly that photo.
UPDATE "User"
SET "googleAvatarUrl" = "avatarUrl"
WHERE "googleId" IS NOT NULL
  AND "googleAvatarUrl" IS NULL
  AND "avatarUrl" LIKE 'http%';
