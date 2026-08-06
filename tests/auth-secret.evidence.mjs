/**
 * Evidence-driven checks for SEC Better Auth secret hardening:
 * no Compose default, weak secrets rejected at entrypoint.
 *
 * Writes a human-readable report under tmp/ (gitignored).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessBetterAuthSecret,
  resolveBetterAuthSecret,
} from "../scripts/lib/auth-secret.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const EVIDENCE_PATH =
  process.env.AUTH_SECRET_EVIDENCE_PATH ??
  resolve(root, "tmp/auth-secret-evidence.txt");

/** @type {{ name: string, passed: boolean, detail: string }[]} */
const checks = [];
const errors = [];

function record(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) errors.push(`${name}: ${detail}`);
}

function checkComposeDefaults() {
  const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");
  const hasBareSecret = /BETTER_AUTH_SECRET:\s*\$\{BETTER_AUTH_SECRET\}/.test(
    compose,
  );
  const hasDefaultSecret = /BETTER_AUTH_SECRET:-\S+/.test(compose);
  const hasLegacySecret = /change-me-to-a-long-random-string/.test(compose);

  const passed = hasBareSecret && !hasDefaultSecret && !hasLegacySecret;

  record(
    "docker-compose.yml requires BETTER_AUTH_SECRET with no default",
    passed,
    [
      `bare BETTER_AUTH_SECRET interpolation: ${hasBareSecret}`,
      `default BETTER_AUTH_SECRET syntax present: ${hasDefaultSecret}`,
      `legacy change-me secret present: ${hasLegacySecret}`,
    ].join("\n  "),
  );
}

function checkEnvExample() {
  const example = readFileSync(resolve(root, ".env.example"), "utf8");
  const documentsSecret = /^BETTER_AUTH_SECRET=/m.test(example);
  const hasLegacyDefault =
    /change-me-to-a-long-random-string/.test(example) ||
    /BETTER_AUTH_SECRET=["']?replace-with-a-long-random-string["']?/.test(
      example,
    );

  record(
    ".env.example documents BETTER_AUTH_SECRET without forgeable defaults",
    documentsSecret && !hasLegacyDefault,
    [
      `BETTER_AUTH_SECRET line present: ${documentsSecret}`,
      `legacy forgeable default present: ${hasLegacyDefault}`,
    ].join("\n  "),
  );
}

const STRONG_AUTH_SECRET = "deadbeef0123456789abcdef01234567";

function checkPolicyHelpers() {
  const weak = assessBetterAuthSecret("change-me-to-a-long-random-string");
  const short = assessBetterAuthSecret("Abcdefghijklmno1");
  const lettersOnly = assessBetterAuthSecret("a".repeat(32));
  const strong = assessBetterAuthSecret(STRONG_AUTH_SECRET);
  const missing = resolveBetterAuthSecret({ secret: "", required: true });
  const weakResolved = resolveBetterAuthSecret({
    secret: "change-me-to-a-long-random-string",
    required: true,
  });
  const ok = resolveBetterAuthSecret({
    secret: STRONG_AUTH_SECRET,
    required: true,
  });

  const passed =
    weak.weak === true &&
    short.weak === true &&
    lettersOnly.weak === true &&
    strong.weak === false &&
    Boolean(missing.error) &&
    Boolean(weakResolved.error) &&
    ok.action === "proceed";

  record(
    "credential policy helpers reject weak / missing Better Auth secrets",
    passed,
    [
      `legacy default weak: ${weak.weak} (${weak.reason ?? "ok"})`,
      `16-char mixed weak: ${short.weak} (${short.reason ?? "ok"})`,
      `letters-only weak: ${lettersOnly.weak} (${lettersOnly.reason ?? "ok"})`,
      `strong hex weak: ${strong.weak}`,
      `missing error: ${missing.error ?? "none"}`,
      `weak resolve error: ${weakResolved.error ?? "none"}`,
      `strong action: ${ok.action}`,
    ].join("\n  "),
  );
}

function checkEntrypointScript(name, env, expect) {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-auth-secret.mjs"],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? "",
      },
      encoding: "utf8",
    },
  );
  const combined = `${result.stdout}\n${result.stderr}`;
  const statusOk = result.status === expect.status;
  const outputOk = expect.outputIncludes.every((snippet) =>
    combined.includes(snippet),
  );
  const passed = statusOk && outputOk && !result.error;

  record(
    name,
    passed,
    [
      `exit status: ${result.status} (expected ${expect.status})`,
      `spawn error: ${result.error ? String(result.error) : "none"}`,
      `expected output snippets: ${JSON.stringify(expect.outputIncludes)}`,
      "--- stdout ---",
      (result.stdout ?? "").trim() || "(empty)",
      "--- stderr ---",
      (result.stderr ?? "").trim() || "(empty)",
    ].join("\n  "),
  );
}

function checkDockerfileEntrypoint() {
  const dockerfile = readFileSync(resolve(root, "Dockerfile"), "utf8");
  const hasCheck = dockerfile.includes("scripts/check-auth-secret.mjs");
  record(
    "Dockerfile runs Better Auth secret check before migrate/start",
    hasCheck,
    `check-auth-secret.mjs in CMD: ${hasCheck}`,
  );
}

function formatEvidence() {
  const passed = errors.length === 0;
  const lines = [
    "Compose Better Auth secret default removed: evidence",
    `timestamp: ${new Date().toISOString()}`,
    `node: ${process.version}`,
    `cwd: ${root}`,
    "",
    "=== checks ===",
  ];

  for (const check of checks) {
    lines.push(
      "",
      `${check.passed ? "PASS" : "FAIL"}  ${check.name}`,
      `  ${check.detail.replace(/\n/g, "\n  ")}`,
    );
  }

  lines.push("", "=== result ===", passed ? "PASS" : "FAIL");
  if (errors.length > 0) {
    lines.push("", "=== errors ===", ...errors);
  }
  return { passed, output: lines.join("\n") };
}

function main() {
  checkComposeDefaults();
  checkEnvExample();
  checkPolicyHelpers();
  checkDockerfileEntrypoint();

  checkEntrypointScript(
    "check-auth-secret exits when BETTER_AUTH_SECRET unset",
    { BETTER_AUTH_SECRET: "" },
    {
      status: 1,
      outputIncludes: ["BETTER_AUTH_SECRET must be set"],
    },
  );

  checkEntrypointScript(
    "check-auth-secret exits on legacy change-me secret",
    { BETTER_AUTH_SECRET: "change-me-to-a-long-random-string" },
    {
      status: 1,
      outputIncludes: ["weak Better Auth secret"],
    },
  );

  checkEntrypointScript(
    "check-auth-secret accepts strong generated secret",
    { BETTER_AUTH_SECRET: STRONG_AUTH_SECRET },
    {
      status: 0,
      outputIncludes: ["Better Auth secret OK"],
    },
  );

  const { passed, output } = formatEvidence();
  mkdirSync(resolve(EVIDENCE_PATH, ".."), { recursive: true });
  writeFileSync(EVIDENCE_PATH, output, "utf8");
  console.log(output);
  console.log(`\nEvidence written to ${EVIDENCE_PATH}`);
  console.log(`Evidence file exists: ${existsSync(EVIDENCE_PATH)}`);

  if (!passed) process.exit(1);
}

main();
