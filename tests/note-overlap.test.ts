import assert from "node:assert/strict";
import {
  clampPeel,
  DRAG_PEEL_FLOOR,
  peelByNoteId,
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

function note(id: string) {
  return { id };
}

test("dragged note peels at the floor over empty space", () => {
  const peels = peelByNoteId([note("a"), note("b")], "a");
  assert.equal(peels.get("a"), DRAG_PEEL_FLOOR);
  assert.equal(peels.has("b"), false);
});

test("covered neighbors stay flat — contact does not peel", () => {
  const peels = peelByNoteId([note("a"), note("b")], "a");
  assert.equal(peels.get("a"), DRAG_PEEL_FLOOR);
  assert.equal(peels.get("b"), undefined);
  assert.equal(peels.size, 1);
});

test("unknown dragging id peels nothing", () => {
  const peels = peelByNoteId([note("a")], "missing");
  assert.equal(peels.size, 0);
});

test("no peels when nothing is dragging", () => {
  const peels = peelByNoteId([note("a"), note("b")], null);
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
  assert.equal(floor.size, 28.5);
  assert.equal(floor.angle, 115.7);
  assert.equal(floor.opacity, 1);
  assert.equal(
    floor.clipPath,
    "polygon(0px 0px, 191.5px 0px, 220px 28.5px, 220px 200px, 0px 200px)",
  );
});

if (failures > 0) {
  process.exitCode = 1;
}
