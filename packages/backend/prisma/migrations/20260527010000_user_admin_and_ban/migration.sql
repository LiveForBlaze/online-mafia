-- Admin role + granular ban system.
--   isAdmin           — назначается ENV ADMIN_EMAILS на старте бэкенда; нет UI.
--   banRestrictions   — массив кодов запретов (см. shared/constants/admin.ts).
--                       Пустой = без бана. site_access — полный блок сайта.
--   bannedAt          — момент последнего применения бана (для аудита).
--   banReason         — текст причины, видимый юзеру и в логах.

ALTER TABLE "User"
  ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "banRestrictions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "bannedAt" TIMESTAMP(3),
  ADD COLUMN "banReason" TEXT;
