-- Drop Google profile photo as a usable avatar selection.
--
-- Раньше пикер аватарок принимал sentinel 'google' и сервер сохранял в
-- `User.avatarUrl` URL Google-фотки. Это превращало любую картинку
-- из Google-профиля в аватарку online-mafia — что подрывает идею
-- курируемого набора (особенно для reward-аватарок: атакующий мог
-- загрузить нашу альфа-аватарку в свой Google и носить её без ачивки).
--
-- Эта миграция занулит `avatarUrl` у всех, у кого сейчас в нём
-- хранится Google-фотка (т.е. avatarUrl === googleAvatarUrl).
-- `googleAvatarUrl` мы оставляем — это всего лишь кэш, на видимое
-- состояние аккаунта он не влияет.
--
-- После миграции такие юзеры увидят стартовую инициалку (как до выбора
-- аватара) и смогут выбрать любой стандартный аватар через /user.

UPDATE "User"
SET "avatarUrl" = NULL
WHERE "avatarUrl" IS NOT NULL
  AND "googleAvatarUrl" IS NOT NULL
  AND "avatarUrl" = "googleAvatarUrl";
