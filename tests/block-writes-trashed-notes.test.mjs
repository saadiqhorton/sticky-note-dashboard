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

test("PATCH looks up owned note and returns before updating", () => {
  const lookupIdx = patchSource.search(/await\s+getOwnedNote\s*\(/);
  const updateIdx = patchSource.search(/prisma\.note\.update\s*\(/);
  assert.ok(lookupIdx >= 0, "getOwnedNote call missing");
  assert.ok(updateIdx >= 0, "prisma.note.update missing");
  assert.ok(
    lookupIdx < updateIdx,
    "getOwnedNote must precede prisma.note.update",
  );

  // Missing/trashed lookup must short-circuit before the write.
  const between = patchSource.slice(lookupIdx, updateIdx);
  assert.match(
    between,
    /if\s*\(\s*"error"\s+in\s+result\s*&&\s*result\.error\s*\)\s*return\s+result\.error/,
  );
  assert.equal(
    (between.match(/prisma\.note\.update\s*\(/g) || []).length,
    0,
    "no note update may run before the getOwnedNote error return",
  );
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\nAll block-writes-trashed-notes tests passed");
