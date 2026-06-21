-- DB-уровневая защита от race condition в claimJudgeSeat:
-- "один судья на лобби". Раньше проверка делалась через read-check-update
-- без транзакции/лока — два участника параллельно проходили гейт
-- `judgeTaken` и оба выставляли isJudge=true (seat=null).
--
-- Прежний `@@unique([lobbyId, seat])` это НЕ ловит: судейские строки имеют
-- seat=NULL, а Postgres считает NULL'ы различными, так что два судьи не
-- конфликтуют. Partial unique index по (lobbyId) WHERE isJudge=true
-- закрывает дыру атомарно: вторая попытка упадёт с P2002, приложение
-- ловит и возвращает JUDGE_SLOT_TAKEN как обычно.
--
-- ВНИМАНИЕ: если в БД УЖЕ есть лобби с двумя судьями (наследие до этой
-- защиты), `prisma migrate deploy` упадёт на создании индекса. Продукт
-- свежий, по решению владельца это допустимо; деструктивный cleanup
-- намеренно НЕ добавляем — лучше явный сбой миграции, чем тихое удаление
-- судейского флага у живого лобби.

CREATE UNIQUE INDEX "LobbyMember_one_judge_per_lobby"
  ON "LobbyMember" ("lobbyId")
  WHERE "isJudge" = true;
