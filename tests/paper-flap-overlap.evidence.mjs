/**
 * Evidence checks for drag-only paper-flap peel (no contact trigger).
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
  "only the dragged note peels; contact does not trigger a flap",
  /DRAG_PEEL_FLOOR/.test(overlapLib) &&
    /peels\.set\(draggingId/.test(overlapLib) &&
    !/noteOverlapRatio/.test(overlapLib) &&
    !/peels\.set\(other\.id/.test(overlapLib),
  "src/lib/note-overlap.ts must peel only the dragged note at the drag floor",
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
  "sticky note maps peel to the paper fold and exposes data-peel",
  /<PaperFlap/.test(stickyNote) &&
    /flapGeometry\(peel/.test(stickyNote) &&
    /data-peel=\{peel\.toFixed\(2\)\}/.test(stickyNote),
  "sticky-note-card.tsx must clip the note face and draw the fold from peel",
);

record(
  "fold is a corner dog-ear with reduced-motion jumps",
  /polygon\(0px 0px/.test(read("src/lib/paper-flap.ts")) &&
    /paper-fold-back/.test(css) &&
    /paper-fold-arm/.test(css) &&
    /sticky-note-face/.test(css) &&
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.paper-fold-arm[\s\S]*transition:\s*none/.test(
      css,
    ),
  "flap must clip a triangular corner and skip motion when the user prefers reduced motion",
);

const unit = spawnSync("npx", ["tsx", "tests/note-overlap.test.ts"], {
  cwd: root,
  encoding: "utf8",
});
record(
  "drag-peel unit tests pass",
  unit.status === 0,
  unit.status === 0
    ? (unit.stdout || "ok").trim()
    : `${unit.stdout}\n${unit.stderr}`.trim(),
);

mkdirSync(resolve(root, "tmp"), { recursive: true });
const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed).length;
const lines = [
  "# Paper-flap drag motion evidence",
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
