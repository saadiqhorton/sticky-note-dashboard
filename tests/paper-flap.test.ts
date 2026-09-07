import assert from "node:assert/strict";
import { FOLD_SIZE, mixInk, mixWhite } from "../src/lib/paper-flap";

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

const YELLOW = "#FFE566";
const PINK = "#FFC2D1";

test("mixing nothing returns the note tint", () => {
  assert.equal(mixWhite(YELLOW, 0), "#ffe566");
  assert.equal(mixInk(YELLOW, 0), "#ffe566");
});

test("mixWhite reaches white, mixInk reaches ink", () => {
  assert.equal(mixWhite(YELLOW, 1), "#ffffff");
  assert.equal(mixInk(YELLOW, 1), "#2c2416");
});

test("the lit tip is lighter than the tint and the crease is darker", () => {
  const [, tintG] = [0, 0xe5];
  const lit = Number.parseInt(mixWhite(YELLOW, 0.8).slice(3, 5), 16);
  const shaded = Number.parseInt(mixInk(YELLOW, 0.28).slice(3, 5), 16);
  assert.ok(lit > tintG, `lit ${lit} should be lighter than ${tintG}`);
  assert.ok(shaded < tintG, `shaded ${shaded} should be darker than ${tintG}`);
});

test("each tint folds in its own hue", () => {
  assert.notEqual(mixWhite(YELLOW, 0.8), mixWhite(PINK, 0.8));
  assert.notEqual(mixInk(YELLOW, 0.28), mixInk(PINK, 0.28));
});

test("mixes stay valid six-digit hex", () => {
  for (const amount of [0, 0.1, 0.28, 0.5, 0.8, 1]) {
    assert.match(mixWhite(PINK, amount), /^#[0-9a-f]{6}$/);
    assert.match(mixInk(PINK, amount), /^#[0-9a-f]{6}$/);
  }
});

test("fold size is a positive px length", () => {
  assert.ok(Number.isFinite(FOLD_SIZE) && FOLD_SIZE > 0);
});

if (failures > 0) {
  process.exitCode = 1;
}
