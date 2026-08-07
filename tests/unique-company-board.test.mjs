import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  assert.match(sql, /UPDATE\s+"Note"/i);
  assert.match(sql, /DELETE FROM\s+"Board"/i);
  assert.match(sql, /WHERE\s+"type"\s*=\s*'company'/i);
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
