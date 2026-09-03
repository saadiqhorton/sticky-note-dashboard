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

record(
  "canvas does not peel notes while dragging",
  !/peelByNoteId/.test(canvas) && !/peel=\{/.test(canvas),
  "board-canvas.tsx must not wire drag to peel",
);

record(
  "sticky note lifts on pointer enter, not drag",
  /onPointerOver/.test(stickyNote) &&
    /onMouseEnter/.test(stickyNote) &&
    /data-lifted=\{lifted \? "true" : "false"\}/.test(stickyNote) &&
    /<PaperFlap/.test(stickyNote) &&
    !/peel=/.test(stickyNote),
  "sticky-note-card.tsx must set data-lifted from pointer enter and clear it while dragging",
);

record(
  "fold follows hover or data-lifted, not a hover media query",
  /\[data-lifted="true"\] \.paper-fold/.test(css) &&
    /paper-fold-curl/.test(read("src/components/paper-flap.tsx")) &&
    !/clip-path: polygon\(/.test(read("src/components/sticky-note-card.tsx")) &&
    !/\.sticky-note-face \{[\s\S]*clip-path/.test(css),
  "curl is an overlay; the note face is never bitten",
);

record(
  "reduced motion is gentler, not zero",
  /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*transition-duration: 80ms/.test(
    css,
  ),
  "reduced motion must keep a faster fold, not skip it",
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
