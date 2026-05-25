-- One-off backfill: grant «alpha_tester» to every non-bot user who already
-- has at least one played-or-judged game by the time this migration runs.
--
-- The achievement column itself was added in 20260525010000. Players who
-- finished games before the achievements pipeline shipped have stats but
-- no badge — this catches them up.

UPDATE "User"
SET "achievements" = jsonb_build_array(
  jsonb_build_object(
    'id', 'alpha_tester',
    'earnedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
)
WHERE "isBot" = false
  AND ("gamesPlayed" > 0 OR "gamesAsJudge" > 0)
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE("achievements", '[]'::jsonb)) elem
    WHERE elem->>'id' = 'alpha_tester'
  );
