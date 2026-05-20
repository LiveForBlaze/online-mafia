-- Host-only role pre-assignment for testing. When non-null, the engine uses
-- this role for the player instead of randomizing.
ALTER TABLE "LobbyMember" ADD COLUMN "preassignedRole" TEXT;
