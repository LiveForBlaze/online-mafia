-- Add a separate column for the user's Google profile photo URL.
-- Lets users switch to a standard avatar and later restore their Google one
-- without re-running OAuth.
ALTER TABLE "User" ADD COLUMN "googleAvatarUrl" TEXT;
