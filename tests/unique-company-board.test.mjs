import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertEmptyCompanyBoardFixture,
  databaseNameFromUrl,
  isDisposableTestDatabaseName,
} from "./helpers/test-database-guard.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

function extractFunction(source, exportName) {
  const start = source.indexOf(`export async function ${exportName}`);
  assert.ok(start >= 0, `${exportName} export not found`);
  const nextExport = source.indexOf("\nexport ", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

const migrationPath = resolve(
  root,
  "prisma/migrations/20260807000000_unique_company_board/migration.sql",
);
const notesPath = resolve(root, "src/lib/notes.ts");
const bootstrapPath = resolve(root, "scripts/bootstrap.mjs");

test("migration adds partial unique index for company boards", () => {
  assert.equal(existsSync(migrationPath), true, "migration file missing");
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(
    sql,
    /CREATE UNIQUE INDEX\s+"Board_type_company_key"\s+ON\s+"Board"\s*\(\s*"type"\s*\)\s*WHERE\s+"type"\s*=\s*'company'/i,
  );
});

test("migration merges duplicate company boards before indexing", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(
    sql,
    /LOCK TABLE\s+"Board",\s*"Note"\s+IN EXCLUSIVE MODE/i,
  );
  assert.match(sql, /UPDATE\s+"Note"/i);
  assert.match(sql, /DELETE FROM\s+"Board"/i);
  assert.match(sql, /WHERE\s+"type"\s*=\s*'company'/i);
});

test("migration renumbers zIndex densely instead of offsetting from the max", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /ROW_NUMBER\(\)\s+OVER/i);
  assert.match(sql, /"zIndex"\s*=\s*m\.new_z/);
  assert.match(sql, /EXISTS\s*\(\s*SELECT 1 FROM ranked WHERE rn > 1\s*\)/i);
  assert.doesNotMatch(sql, /max_z/i);
});

test("migration never cascade-deletes notes when dropping duplicate boards", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /DELETE FROM\s+"Board"\s+AS\s+b/i);
  assert.match(
    sql,
    /AND\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+"Note"\s+n\s+WHERE\s+n\."boardId"\s*=\s*b\.id\s*\)/i,
  );
});

test("migration relies on the implicit transaction and adds no BEGIN/COMMIT", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const withoutComments = sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  assert.doesNotMatch(withoutComments, /\bBEGIN\b|\bCOMMIT\b/i);
  assert.match(
    withoutComments,
    /LOCK TABLE\s+"Board",\s*"Note"\s+IN EXCLUSIVE MODE/i,
  );
});

test("integration test requires an empty disposable test database", () => {
  const source = readFileSync(
    resolve(root, "tests/unique-company-board.integration.mjs"),
    "utf8",
  );
  assert.match(source, /UNIQUE_COMPANY_BOARD_TEST_DATABASE_URL/);
  assert.match(source, /isDisposableTestDatabaseName/);
  assert.match(source, /assertEmptyCompanyBoardFixture/);
  assert.match(source, /createdCompanyBoardId/);
  assert.match(source, /cleanupFixtures/);
  assert.doesNotMatch(source, /resetCompanyBoards/);
  assert.doesNotMatch(source, /board\.deleteMany\(\s*\{\s*where:\s*\{\s*type:\s*"company"/);
  assert.doesNotMatch(source, /note\.deleteMany/);
  assert.doesNotMatch(source, /loadEnv/);
});

test("test database guard accepts only names with a standalone test segment", () => {
  for (const name of ["stickyboard_test", "test", "test-db", "sticky_test_db"]) {
    assert.equal(
      isDisposableTestDatabaseName(name),
      true,
      `expected "${name}" to be accepted`,
    );
  }
  for (const name of [
    "contest_production",
    "myapptest",
    "latest",
    "stickyboard",
    "prod_test",
    "staging_test",
    "stage_test",
    "preprod_test",
    "uat_test",
    "demo_test",
    "sandbox_test",
    "prod2_test",
    "live_test",
    "",
  ]) {
    assert.equal(
      isDisposableTestDatabaseName(name),
      false,
      `expected "${name}" to be rejected`,
    );
  }
});

test("assertEmptyCompanyBoardFixture throws when company boards or notes exist", () => {
  assert.throws(
    () => assertEmptyCompanyBoardFixture(1, 0, "stickyboard_test"),
    /already holds 1 company board/,
  );
  assert.throws(
    () => assertEmptyCompanyBoardFixture(0, 2, "stickyboard_test"),
    /2 company-board note/,
  );
  assert.doesNotThrow(() =>
    assertEmptyCompanyBoardFixture(0, 0, "stickyboard_test"),
  );
});

test("databaseNameFromUrl extracts the database name for the guard", () => {
  assert.equal(
    databaseNameFromUrl("postgresql://user:pass@127.0.0.1:5432/stickyboard_test"),
    "stickyboard_test",
  );
  assert.equal(databaseNameFromUrl("not-a-url"), "");
});

test("notes helpers detect Prisma unique violations", () => {
  const source = readFileSync(notesPath, "utf8");
  assert.match(source, /function isUniqueConstraintError/);
  assert.match(source, /P2002/);
  assert.match(source, /PrismaClientKnownRequestError/);
});

test("getCompanyBoard handles unique-constraint races", () => {
  const source = readFileSync(notesPath, "utf8");
  const fn = extractFunction(source, "getCompanyBoard");
  assert.match(fn, /try\s*\{/);
  assert.match(fn, /isUniqueConstraintError/);
  assert.match(fn, /findFirst/);
  assert.match(fn, /board\.create/);
});

test("bootstrap ensureCompanyBoard handles unique-constraint races", () => {
  const source = readFileSync(bootstrapPath, "utf8");
  assert.match(source, /async function ensureCompanyBoard/);
  assert.match(source, /P2002/);
  assert.match(source, /Partial unique index Board_type_company_key/);
  const start = source.indexOf("async function ensureCompanyBoard");
  const next = source.indexOf("\nasync function ", start + 1);
  const fn = next === -1 ? source.slice(start) : source.slice(start, next);
  assert.match(fn, /try\s*\{/);
  assert.match(fn, /board\.create/);
  assert.match(fn, /findFirst/);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\nAll unique-company-board tests passed");
