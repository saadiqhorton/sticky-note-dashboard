import assert from "node:assert/strict";
import {
  clampPeel,
  flapGeometry,
  FOLD_SIZE,
  LIFT_ANGLE,
} from "../src/lib/paper-flap";

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

test("lifted flap bites a small corner toward the camera", () => {
  const lifted = flapGeometry(1, 220, 200);
  assert.equal(lifted.size, FOLD_SIZE);
  assert.equal(lifted.angle, LIFT_ANGLE);
  assert.equal(lifted.opacity, 1);
  assert.equal(
    lifted.clipPath,
    `polygon(0px 0px, ${220 - FOLD_SIZE}px 0px, 220px ${FOLD_SIZE}px, 220px 200px, 0px 200px)`,
  );
});

if (failures > 0) {
  process.exitCode = 1;
}
