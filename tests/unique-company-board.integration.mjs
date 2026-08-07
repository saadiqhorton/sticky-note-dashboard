/**
 * Integration test: partial unique index + race-safe getCompanyBoard.
 * Requires DATABASE_URL pointing at a migrated Postgres database.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { getCompanyBoard } from "../src/lib/notes.ts";

loadEnv({ path: resolve(import.meta.dirname, "../.env") });

const prisma = new PrismaClient();

async function resetCompanyBoards() {
  await prisma.note.deleteMany({
    where: { board: { type: "company" } },
  });
  await prisma.board.deleteMany({ where: { type: "company" } });
}

async function main() {
  await resetCompanyBoards();

  const results = await Promise.all(
    Array.from({ length: 12 }, () => getCompanyBoard()),
  );
  const ids = new Set(results.map((board) => board.id));
  assert.equal(ids.size, 1, `expected one company board, got ${ids.size}`);

  const count = await prisma.board.count({ where: { type: "company" } });
  assert.equal(count, 1, `DB should hold exactly one company board, got ${count}`);

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
  const ownerA = `owner-a-${Date.now()}`;
  const ownerB = `owner-b-${Date.now()}`;
  const userA = await prisma.user.create({
    data: { email: `${ownerA}@example.com`, name: "A" },
  });
  const userB = await prisma.user.create({
    data: { email: `${ownerB}@example.com`, name: "B" },
  });
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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
