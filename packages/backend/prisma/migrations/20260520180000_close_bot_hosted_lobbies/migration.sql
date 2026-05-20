-- Close any lobby whose host is a bot. These can only exist as leftovers from
-- the previous leaveLobby logic that transferred host to the next member when
-- the original host left. The current code closes the lobby instead.
UPDATE "Lobby"
SET status = 'CLOSED'
WHERE "hostId" IN (SELECT id FROM "User" WHERE "isBot" = true)
  AND status <> 'CLOSED';
