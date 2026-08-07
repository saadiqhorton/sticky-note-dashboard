-- Ensure at most one Team (company) board exists.
-- Existing deployments may already have duplicates from find-then-create races;
-- merge notes onto the oldest company board, then delete the extras.

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
)
UPDATE "Note" AS n
SET "boardId" = (SELECT id FROM keeper)
FROM dupes AS d
WHERE n."boardId" = d.id;

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
