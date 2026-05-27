-- Clubs feature: 3 new tables + User column changes.
-- Spec: docs/superpowers/specs/2026-05-27-clubs-design.md

CREATE TABLE "Club" (
  "id"         TEXT PRIMARY KEY,
  "name"       TEXT NOT NULL UNIQUE,
  "publicCode" TEXT NOT NULL UNIQUE,
  "headId"     TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Club_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Club_headId_idx" ON "Club" ("headId");

CREATE TABLE "ClubMember" (
  "clubId"   TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubMember_pkey" PRIMARY KEY ("clubId", "userId"),
  CONSTRAINT "ClubMember_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClubMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClubMember_userId_idx" ON "ClubMember" ("userId");

CREATE TABLE "ClubJoinRequest" (
  "clubId"      TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubJoinRequest_pkey" PRIMARY KEY ("clubId", "userId"),
  CONSTRAINT "ClubJoinRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClubJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClubJoinRequest_clubId_idx" ON "ClubJoinRequest" ("clubId");
CREATE INDEX "ClubJoinRequest_userId_idx" ON "ClubJoinRequest" ("userId");

-- User column changes: drop free-text clubName, add primaryClubId.
ALTER TABLE "User" DROP COLUMN "clubName";
ALTER TABLE "User" ADD COLUMN "primaryClubId" TEXT;
ALTER TABLE "User"
  ADD CONSTRAINT "User_primaryClubId_fkey"
  FOREIGN KEY ("primaryClubId") REFERENCES "Club"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
