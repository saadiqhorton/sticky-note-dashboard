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
renumbered AS (
  SELECT
    n.id AS note_id,
    ROW_NUMBER() OVER (
      ORDER BY r.rn ASC, n."zIndex" ASC, n."createdAt" ASC, n.id ASC
    ) AS new_z
  FROM "Note" n
  INNER JOIN ranked r ON r.id = n."boardId"
  WHERE EXISTS (SELECT 1 FROM ranked WHERE rn > 1)
)
UPDATE "Note" AS n
SET
  "boardId" = (SELECT id FROM keeper),
  -- Dense 1..N renumber across the merged board. Adding to the keeper's existing
  -- max would overflow INTEGER when a long-lived board has climbed near 2^31-1.
  "zIndex" = m.new_z
FROM renumbered AS m
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
