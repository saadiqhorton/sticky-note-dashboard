import assert from "node:assert/strict";
import {
  clampPeel,
  DRAG_PEEL_FLOOR,
  noteOverlapRatio,
  peelByNoteId,
  type NoteRect,
} from "../src/lib/note-overlap";
import { flapGeometry } from "../src/lib/paper-flap";

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

test("overlap below the floor still peels the dragged note at the floor", () => {
  const peels = peelByNoteId(
    [rect("a", 0, 0, 100, 100), rect("b", 80, 0, 100, 100)],
    "a",
  );
  assert.equal(peels.get("a"), 0.35);
  assert.equal(peels.get("b"), 0.2);
});

test("no peels when nothing is dragging", () => {
  const peels = peelByNoteId([rect("a", 0, 0), rect("b", 10, 10)], null);
  assert.equal(peels.size, 0);
});

test("clampPeel keeps values in 0–1", () => {
  assert.equal(clampPeel(-0.2), 0);
  assert.equal(clampPeel(0.4), 0.4);
  assert.equal(clampPeel(1.8), 1);
});

test("resting flap does not bite the note", () => {
  const rest = flapGeometry(0, 220, 200);
  assert.equal(rest.size, 0);
  assert.equal(rest.opacity, 0);
  assert.equal(
    rest.clipPath,
    "polygon(0px 0px, 220px 0px, 220px 0px, 220px 200px, 0px 200px)",
  );
});

test("drag floor bites a small corner dog-ear", () => {
  const floor = flapGeometry(DRAG_PEEL_FLOOR, 220, 200);
  assert.equal(floor.size, 24.3);
  assert.equal(floor.opacity, 1);
  assert.equal(
    floor.clipPath,
    "polygon(0px 0px, 195.7px 0px, 220px 24.3px, 220px 200px, 0px 200px)",
  );
});

test("full peel bites further than the drag floor", () => {
  const full = flapGeometry(1, 220, 200);
  assert.equal(full.size, 36);
  assert.equal(
    full.clipPath,
    "polygon(0px 0px, 184px 0px, 220px 36px, 220px 200px, 0px 200px)",
  );
});

if (failures > 0) {
  process.exitCode = 1;
}
