import assert from "node:assert/strict";
import {
  DRAG_PEEL_FLOOR,
  flapTransform,
  noteOverlapRatio,
  peelByNoteId,
  type NoteRect,
} from "../src/lib/note-overlap";

let failures = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

function rect(
  id: string,
  x: number,
  y: number,
  width = 220,
  height = 200,
): NoteRect {
  return { id, x, y, width, height };
}

test("separated notes have zero overlap", () => {
  assert.equal(noteOverlapRatio(rect("a", 0, 0), rect("b", 400, 0)), 0);
});

test("identical notes overlap fully", () => {
  assert.equal(noteOverlapRatio(rect("a", 10, 10), rect("b", 10, 10)), 1);
});

test("partial overlap is intersection over the smaller area", () => {
  const a = rect("a", 0, 0, 100, 100);
  const b = rect("b", 50, 0, 100, 100);
  assert.equal(noteOverlapRatio(a, b), 0.5);
});

test("empty-space drag still peels at the floor", () => {
  const peels = peelByNoteId([rect("a", 0, 0), rect("b", 400, 0)], "a");
  assert.equal(peels.get("a"), DRAG_PEEL_FLOOR);
  assert.equal(peels.has("b"), false);
});

test("dragged note and covered neighbor both peel by overlap", () => {
  const peels = peelByNoteId(
    [rect("a", 0, 0, 100, 100), rect("b", 50, 0, 100, 100)],
    "a",
  );
  assert.equal(peels.get("a"), 0.5);
  assert.equal(peels.get("b"), 0.5);
});

test("no peels when nothing is dragging", () => {
  const peels = peelByNoteId([rect("a", 0, 0), rect("b", 10, 10)], null);
  assert.equal(peels.size, 0);
});

test("flap at drag floor matches the previous 54deg / 1.05 curl", () => {
  const { rotateDeg, scale } = flapTransform(DRAG_PEEL_FLOOR);
  assert.ok(Math.abs(rotateDeg - 54.45) < 0.01);
  assert.ok(Math.abs(scale - 1.056) < 0.001);
});

test("full peel curls further than the drag-only flap", () => {
  const rest = flapTransform(0);
  const full = flapTransform(1);
  assert.equal(rest.rotateDeg, 45);
  assert.equal(rest.scale, 1);
  assert.equal(full.rotateDeg, 72);
  assert.equal(full.scale, 1.16);
});

if (failures > 0) {
  process.exitCode = 1;
}
