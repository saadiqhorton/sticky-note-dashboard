-- Ensure at most one Team (company) board exists.
-- Existing deployments may already have duplicates from find-then-create races;
-- merge notes onto the oldest company board, then delete the extras.

-- Hold an exclusive lock for the rest of this migration so concurrent app traffic
-- cannot insert notes onto duplicate boards between the merge UPDATE and the DELETE
-- (those notes would otherwise survive on a board that is about to be deleted).
-- Prisma sends this whole file as one simple query, so Postgres wraps it in an
-- implicit transaction: the lock is held until the transaction ends and the
-- migration is all-or-nothing. Without that implicit transaction this LOCK would
-- raise 25P01 and abort before any destructive statement runs.
-- Do NOT wrap this file in BEGIN/COMMIT — COMMIT would release the lock early.
-- When applying this file by hand, use `psql --single-transaction`.
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

DELETE FROM "Board" AS b
WHERE b.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
    FROM "Board"
    WHERE "type" = 'company'
  ) AS ranked
  WHERE rn > 1
)
-- Never cascade-delete notes. If the merge above did not move every note, the duplicate
-- survives and CREATE UNIQUE INDEX below fails loudly instead of destroying data.
AND NOT EXISTS (SELECT 1 FROM "Note" n WHERE n."boardId" = b.id);

-- Partial unique index: only one row with type = 'company' (private boards unrestricted).
CREATE UNIQUE INDEX "Board_type_company_key" ON "Board" ("type")
WHERE "type" = 'company';
