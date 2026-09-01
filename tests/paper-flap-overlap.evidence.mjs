/**
 * Evidence checks for overlap-aware paper-flap peel.
 * Writes a human-readable report under tmp/ (gitignored).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const EVIDENCE_PATH =
  process.env.PAPER_FLAP_OVERLAP_EVIDENCE_PATH ??
  resolve(root, "tmp/paper-flap-overlap-evidence.md");

/** @type {{ name: string, passed: boolean, detail: string }[]} */
const checks = [];
const errors = [];

function record(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) errors.push(`${name}: ${detail}`);
}

function read(relPath) {
  return readFileSync(resolve(root, relPath), "utf8");
}

const overlapLib = read("src/lib/note-overlap.ts");
const stickyNote = read("src/components/sticky-note-card.tsx");
const canvas = read("src/components/board-canvas.tsx");
const css = read("src/app/globals.css");

record(
  "overlap helper peels both the dragged note and covered neighbors",
  /peels\.set\(other\.id, (?:clampPeel\()?ratio/.test(overlapLib) &&
    /DRAG_PEEL_FLOOR/.test(overlapLib) &&
    /peels\.set\(draggingId/.test(overlapLib),
  "src/lib/note-overlap.ts must compute neighbor peel and a drag floor",
);

const canvasWiresPeel =
  /peelByNoteId\(visibleNotes/.test(canvas) &&
  /peel=\{peels\.get\(note\.id\) \?\? 0\}/.test(canvas);
const peelsGatedOnDragMoved =
  /dragMoved/.test(canvas) &&
  (/peelByNoteId\([\s\S]*null/.test(canvas) ||
    /dragMoved\s*\?\s*draggingId\s*:\s*null/.test(canvas));

record(
  "canvas passes peel into each sticky note after drag has moved",
  canvasWiresPeel && peelsGatedOnDragMoved,
  "board-canvas.tsx must wire peelByNoteId → peel only after dragMoved",
);

record(
  "sticky note maps peel to flap transform and exposes data-peel",
  /flapTransform\(peel\)/.test(stickyNote) &&
    /data-peel=\{peel\.toFixed\(2\)\}/.test(stickyNote) &&
    /paper-flap-inner/.test(stickyNote),
  "sticky-note-card.tsx must drive the flap from peel",
);

record(
  "flap motion honors reduced-motion",
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.paper-flap-inner \{[\s\S]*transition:\s*none/.test(
    css,
  ),
  "globals.css must disable .paper-flap-inner transitions under reduced motion",
);

const unit = spawnSync("npx", ["tsx", "tests/note-overlap.test.ts"], {
  cwd: root,
  encoding: "utf8",
});
record(
  "overlap unit tests pass",
  unit.status === 0,
  unit.status === 0
    ? (unit.stdout || "ok").trim()
    : `${unit.stdout}\n${unit.stderr}`.trim(),
);

mkdirSync(resolve(root, "tmp"), { recursive: true });
const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed).length;
const lines = [
  "# Paper-flap overlap motion evidence",
  "",
  `Checks: ${passed} passed, ${failed} failed`,
  "",
  ...checks.map(
    (c) =>
      `- ${c.passed ? "PASS" : "FAIL"} **${c.name}** — ${c.detail.replace(/\n/g, " ")}`,
  ),
  "",
];
writeFileSync(EVIDENCE_PATH, lines.join("\n"));
console.log(lines.join("\n"));
console.log(`Wrote ${EVIDENCE_PATH}`);
if (errors.length) {
  process.exitCode = 1;
}
