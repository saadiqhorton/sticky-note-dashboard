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

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.ok(start >= 0, `${name} not found`);
  const nextExport = source.indexOf("\nexport ", start + 1);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

const routePath = resolve(root, "src/app/api/notes/[id]/route.ts");
const routeSource = readFileSync(routePath, "utf8");
const getOwnedNoteSource = extractFunction(routeSource, "getOwnedNote");
const patchSource = extractFunction(routeSource, "PATCH");

test("getOwnedNote only resolves non-trashed notes", () => {
  assert.match(getOwnedNoteSource, /deletedAt\s*:\s*null/);
  assert.match(
    getOwnedNoteSource,
    /(?:findFirst|findUnique)\s*\(\s*\{[\s\S]*deletedAt\s*:\s*null/,
  );
});

test("PATCH uses getOwnedNote before updating", () => {
  assert.match(patchSource, /getOwnedNote\s*\(/);
  assert.match(patchSource, /prisma\.note\.update/);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\nAll block-writes-trashed-notes tests passed");
