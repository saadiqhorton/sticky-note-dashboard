-- Ensure at most one Team (company) board exists.
-- Existing deployments may already have duplicates from find-then-create races;
-- merge notes onto the oldest company board, then delete the extras.

-- Hold an exclusive lock for the rest of this migration transaction so concurrent
-- app traffic cannot insert notes onto duplicate boards between the merge UPDATE
-- and the DELETE (those notes would otherwise be cascade-deleted).
LOCK TABLE "Board" IN EXCLUSIVE MODE;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Board"
  WHERE "type" = 'company'
),
keeper AS (
  SELECT id FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT id FROM ranked WHERE rn > 1
),
keeper_max AS (
  SELECT COALESCE(MAX(n."zIndex"), 0) AS max_z
  FROM "Note" n
  WHERE n."boardId" = (SELECT id FROM keeper)
),
moving AS (
  SELECT
    n.id AS note_id,
    ROW_NUMBER() OVER (
      ORDER BY b."createdAt" ASC, b.id ASC, n."zIndex" ASC, n."createdAt" ASC, n.id ASC
    ) AS ord
  FROM "Note" n
  INNER JOIN dupes d ON d.id = n."boardId"
  INNER JOIN "Board" b ON b.id = n."boardId"
)
UPDATE "Note" AS n
SET
  "boardId" = (SELECT id FROM keeper),
  -- Remap onto a free zIndex range so notes from different boards do not share
  -- the same stacking order after the merge (list/canvas order by zIndex only).
  "zIndex" = (SELECT max_z FROM keeper_max) + m.ord
FROM moving AS m
WHERE n.id = m.note_id;

DELETE FROM "Board"
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
    FROM "Board"
    WHERE "type" = 'company'
  ) AS ranked
  WHERE rn > 1
);

-- Partial unique index: only one row with type = 'company' (private boards unrestricted).
CREATE UNIQUE INDEX "Board_type_company_key" ON "Board" ("type")
WHERE "type" = 'company';
