import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

function extractPurgeNote(source) {
  const start = source.indexOf("export async function purgeNote");
  assert.ok(start >= 0, "purgeNote export not found");
  const nextExport = source.indexOf("\nexport ", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

const actionsPath = resolve(root, "src/app/trash/actions.ts");
const actionsSource = readFileSync(actionsPath, "utf8");
const purgeNoteSource = extractPurgeNote(actionsSource);

test("purgeNote requires admin", () => {
  assert.match(purgeNoteSource, /requireAdmin\s*\(/);
});

test("purgeNote only deletes notes with deletedAt set", () => {
  assert.match(purgeNoteSource, /deletedAt\s*:\s*\{\s*not\s*:\s*null\s*\}/);
  assert.match(purgeNoteSource, /deleteMany\s*\(/);
  assert.doesNotMatch(
    purgeNoteSource,
    /prisma\.note\.delete\s*\(\s*\{\s*where\s*:\s*\{\s*id\s*:\s*noteId\s*\}\s*\}\s*\)/,
  );
});

test("purgeNote no-ops when no trashed note matches", () => {
  assert.match(purgeNoteSource, /result\.count\s*===\s*0/);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\nAll purge-note-trashed-only tests passed");
