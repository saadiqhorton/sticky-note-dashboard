/**
 * Integration test: partial unique index + race-safe getCompanyBoard.
 *
 * Refuses to run unless UNIQUE_COMPANY_BOARD_TEST_DATABASE_URL points at a
 * disposable database whose name segments include "test" and no production-like
 * segment (prod, staging, uat, demo, ...), AND the database currently has zero
 * company boards and zero company-board notes.
 *
 * This test never deletes a company/Team board — including one created during
 * the run — so a concurrent writer cannot lose its board or notes via our
 * cleanup. Truncate company boards between runs on the disposable DB if needed.
 *
 *   UNIQUE_COMPANY_BOARD_TEST_DATABASE_URL=postgresql://.../stickyboard_test \
 *     npm run test:unique-company-board-integration
 */
import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  assertEmptyCompanyBoardFixture,
  databaseNameFromUrl,
  isDisposableTestDatabaseName,
} from "./helpers/test-database-guard.mjs";

const databaseUrl = process.env.UNIQUE_COMPANY_BOARD_TEST_DATABASE_URL ?? "";

if (!databaseUrl) {
  console.error(
    'Refusing to run: set UNIQUE_COMPANY_BOARD_TEST_DATABASE_URL to a disposable test database (a "_" / "-" separated name segment must equal "test").',
  );
  process.exit(1);
}

const databaseName = databaseNameFromUrl(databaseUrl);
if (!isDisposableTestDatabaseName(databaseName)) {
  console.error(
    `Refusing to run against database "${databaseName || "(unparsed)"}" — a name segment must equal "test" and no segment may look production-like (prod, production, prd, live, staging, stage, preprod, uat, demo, sandbox).`,
  );
  process.exit(1);
}

// Prefer the explicit test URL over any .env DATABASE_URL for Prisma + app code.
process.env.DATABASE_URL = databaseUrl;

const { getCompanyBoard } = await import("../src/lib/notes.ts");
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const createdUserIds = [];

async function cleanupFixtures() {
  // Only remove users/private boards this test created. Never delete company boards:
  // after the empty pre-flight another process could create the Team board we observe,
  // and treating it as test-owned would cascade-delete their notes.
  if (createdUserIds.length === 0) return;
  await prisma.board.deleteMany({
    where: { ownerUserId: { in: createdUserIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: createdUserIds } },
  });
}

async function assertStillEmptyCompanyFixture() {
  const [companyBoardCount, companyBoardNoteCount] = await Promise.all([
    prisma.board.count({ where: { type: "company" } }),
    prisma.note.count({ where: { board: { type: "company" } } }),
  ]);
  assertEmptyCompanyBoardFixture(
    companyBoardCount,
    companyBoardNoteCount,
    databaseName,
  );
}

async function main() {
  await assertStillEmptyCompanyFixture();

  try {
    // Re-check immediately before creates so we fail closed if another process
    // inserted a Team board after the first pre-flight.
    await assertStillEmptyCompanyFixture();

    const results = await Promise.all(
      Array.from({ length: 12 }, () => getCompanyBoard()),
    );
    const ids = new Set(results.map((board) => board.id));
    assert.equal(ids.size, 1, `expected one company board, got ${ids.size}`);

    const count = await prisma.board.count({ where: { type: "company" } });
    assert.equal(
      count,
      1,
      `DB should hold exactly one company board, got ${count}`,
    );

    let rejected = false;
    try {
      await prisma.board.create({
        data: { type: "company", name: "Duplicate Team Board" },
      });
    } catch (error) {
      rejected = true;
      assert.equal(
        error instanceof Prisma.PrismaClientKnownRequestError,
        true,
        "expected Prisma known request error",
      );
      assert.equal(error.code, "P2002");
    }
    assert.equal(rejected, true, "second company board insert must fail");

    // Private boards remain unrestricted by the company partial index.
    const stamp = Date.now();
    const userA = await prisma.user.create({
      data: { email: `owner-a-${stamp}@example.com`, name: "A" },
    });
    const userB = await prisma.user.create({
      data: { email: `owner-b-${stamp}@example.com`, name: "B" },
    });
    createdUserIds.push(userA.id, userB.id);

    await prisma.board.create({
      data: { type: "private", name: "My board", ownerUserId: userA.id },
    });
    await prisma.board.create({
      data: { type: "private", name: "My board", ownerUserId: userB.id },
    });

    console.log("PASS  concurrent getCompanyBoard yields a single company board");
    console.log("PASS  partial unique index rejects a second company board");
    console.log("PASS  private boards can still be created per owner");
    console.log("\nAll unique-company-board integration tests passed");
  } finally {
    await cleanupFixtures();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
