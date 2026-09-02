import assert from "node:assert/strict";
import {
  clampPeel,
  DRAG_PEEL_FLOOR,
  noteOverlapRatio,
  peelByNoteId,
  type NoteRect,
} from "../src/lib/note-overlap";
import { flapMotion } from "../src/lib/paper-flap";

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

test("resting flap is hidden and already posed above scale 0.9", () => {
  const rest = flapMotion(0);
  assert.equal(rest.leafOpacity, 0);
  assert.equal(rest.revealOpacity, 0);
  assert.equal(
    rest.leafTransform,
    "translate3d(0px, 0px, 0px) rotateX(8deg) rotateY(12deg) rotateZ(-10deg) scale(0.94)",
  );
  assert.equal(rest.revealTransform, "scale(0.78)");
});

test("drag floor is a 3d crease fold, not a 2d square spin", () => {
  const floor = flapMotion(DRAG_PEEL_FLOOR);
  assert.equal(floor.leafOpacity, 0.948);
  assert.equal(
    floor.leafTransform,
    "translate3d(2.8px, -4.2px, 7px) rotateX(17.1deg) rotateY(19.7deg) rotateZ(-12.8deg) scale(0.968)",
  );
  assert.equal(floor.revealOpacity, 0.308);
  assert.equal(floor.revealTransform, "scale(0.857)");
});

test("full peel folds further than the drag floor", () => {
  const full = flapMotion(1);
  assert.equal(full.leafOpacity, 1);
  assert.equal(
    full.leafTransform,
    "translate3d(8px, -12px, 20px) rotateX(34deg) rotateY(34deg) rotateZ(-18deg) scale(1.02)",
  );
  assert.equal(full.revealOpacity, 0.88);
  assert.equal(full.revealTransform, "scale(1)");
});

if (failures > 0) {
  process.exitCode = 1;
}
