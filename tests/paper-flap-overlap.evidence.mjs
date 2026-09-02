/**
 * Evidence checks for hover-only paper-flap (no drag / contact trigger).
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

const stickyNote = read("src/components/sticky-note-card.tsx");
const canvas = read("src/components/board-canvas.tsx");
const css = read("src/app/globals.css");
const flap = read("src/components/paper-flap.tsx");

record(
  "canvas does not peel notes while dragging",
  !/peelByNoteId/.test(canvas) && !/peel=\{/.test(canvas),
  "board-canvas.tsx must not wire drag to peel",
);

record(
  "sticky note exposes dragging and draws the fold",
  /data-dragging=\{dragging \? "true" : "false"\}/.test(stickyNote) &&
    /<PaperFlap/.test(stickyNote) &&
    !/peel=/.test(stickyNote),
  "sticky-note-card.tsx must mark dragging and not take a peel prop",
);

record(
  "fold lifts on hover, not while dragging",
  /@media \(hover: hover\) and \(pointer: fine\)/.test(css) &&
    /:hover:not\(\[data-dragging="true"\]\) \.paper-fold/.test(css) &&
    /:hover:not\(\[data-dragging="true"\]\) \.paper-fold-arm/.test(css) &&
    !/data-lifted/.test(flap),
  "globals.css must lift the corner on fine-pointer hover and suppress it while dragging",
);

record(
  "reduced motion is gentler, not zero",
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*-12deg/.test(css),
  "reduced motion must keep a smaller lift",
);

const unit = spawnSync("npx", ["tsx", "tests/note-overlap.test.ts"], {
  cwd: root,
  encoding: "utf8",
});
record(
  "flap geometry unit tests pass",
  unit.status === 0,
  unit.status === 0
    ? (unit.stdout || "ok").trim()
    : `${unit.stdout}\n${unit.stderr}`.trim(),
);

mkdirSync(resolve(root, "tmp"), { recursive: true });
const passed = checks.filter((c) => c.passed).length;
const failed = checks.filter((c) => !c.passed).length;
const lines = [
  "# Paper-flap hover motion evidence",
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
