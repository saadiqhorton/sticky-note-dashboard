/**
 * Evidence-driven checks for SEC Compose Postgres hardening:
 * no host port publish, no default password in YAML, weak passwords rejected.
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
  assessPostgresPassword,
  resolvePostgresCredentials,
} from "../scripts/lib/postgres-credentials.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const EVIDENCE_PATH =
  process.env.POSTGRES_CREDENTIALS_EVIDENCE_PATH ??
  resolve(root, "tmp/postgres-credentials-evidence.txt");

/** @type {{ name: string, passed: boolean, detail: string }[]} */
const checks = [];
const errors = [];

function record(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) errors.push(`${name}: ${detail}`);
}

function checkComposeDefaults() {
  const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");
  const hasBarePassword = /POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD\}/.test(
    compose,
  );
  const hasDefaultPassword = /POSTGRES_PASSWORD:-\S+/.test(compose);
  const hasLegacyPassword = /POSTGRES_PASSWORD:\s*stickyboard\b/.test(compose);
  const publishesHostPort = /5433:5432/.test(compose);
  const hasDbPortsBlock =
    /db:[\s\S]*?ports:\s*\n\s*-\s*["']?\d+:5432/.test(compose);
  const wiresDatabaseUrl =
    /DATABASE_URL:\s*postgresql:\/\/stickyboard:\$\{POSTGRES_PASSWORD\}@db:5432\/stickyboard/.test(
      compose,
    );

  const passed =
    hasBarePassword &&
    !hasDefaultPassword &&
    !hasLegacyPassword &&
    !publishesHostPort &&
    !hasDbPortsBlock &&
    wiresDatabaseUrl;

  record(
    "docker-compose.yml keeps Postgres internal and requires POSTGRES_PASSWORD",
    passed,
    [
      `bare POSTGRES_PASSWORD interpolation: ${hasBarePassword}`,
      `default POSTGRES_PASSWORD syntax present: ${hasDefaultPassword}`,
      `hardcoded stickyboard password: ${hasLegacyPassword}`,
      `publishes 5433:5432: ${publishesHostPort}`,
      `db ports mapping present: ${hasDbPortsBlock}`,
      `DATABASE_URL uses POSTGRES_PASSWORD: ${wiresDatabaseUrl}`,
    ].join("\n  "),
  );
}

function checkDevOverlay() {
  const overlay = readFileSync(resolve(root, "docker-compose.dev.yml"), "utf8");
  const loopbackOnly = /127\.0\.0\.1:5433:5432/.test(overlay);
  const allInterfaces = /^\s*-\s*["']?5433:5432["']?\s*$/m.test(overlay);
  record(
    "docker-compose.dev.yml optionally publishes Postgres on loopback only",
    loopbackOnly && !allInterfaces,
    [
      `contains 127.0.0.1:5433:5432: ${loopbackOnly}`,
      `all-interfaces 5433:5432: ${allInterfaces}`,
    ].join("\n  "),
  );
}

function checkEnvExample() {
  const example = readFileSync(resolve(root, ".env.example"), "utf8");
  const hasLegacyUrl = /postgresql:\/\/stickyboard:stickyboard@/.test(example);
  const hasLegacyPassword = /POSTGRES_PASSWORD=["']?stickyboard["']?/.test(
    example,
  );
  const documentsPassword = /^POSTGRES_PASSWORD=/m.test(example);

  record(
    ".env.example does not ship stickyboard/stickyboard DB credentials",
    documentsPassword && !hasLegacyUrl && !hasLegacyPassword,
    [
      `POSTGRES_PASSWORD line present: ${documentsPassword}`,
      `legacy DATABASE_URL stickyboard/stickyboard: ${hasLegacyUrl}`,
      `POSTGRES_PASSWORD=stickyboard: ${hasLegacyPassword}`,
    ].join("\n  "),
  );
}

const STRONG_DB_PASSWORD = "deadbeef0123456789abcdef01234567";

function checkPolicyHelpers() {
  const weak = assessPostgresPassword("stickyboard");
  const short = assessPostgresPassword("Abcdefghijklm1");
  const unsafe = assessPostgresPassword("CorrectHorseBattery1!");
  const strong = assessPostgresPassword(STRONG_DB_PASSWORD);
  const missing = resolvePostgresCredentials({ password: "", required: true });
  const weakResolved = resolvePostgresCredentials({
    password: "stickyboard",
    required: true,
  });
  const ok = resolvePostgresCredentials({
    password: STRONG_DB_PASSWORD,
    required: true,
  });

  const passed =
    weak.weak === true &&
    short.weak === true &&
    unsafe.weak === true &&
    strong.weak === false &&
    Boolean(missing.error) &&
    Boolean(weakResolved.error) &&
    ok.action === "proceed";

  record(
    "credential policy helpers reject weak / missing Postgres passwords",
    passed,
    [
      `stickyboard weak: ${weak.weak} (${weak.reason ?? "ok"})`,
      `15-char mixed weak: ${short.weak} (${short.reason ?? "ok"})`,
      `unsafe charset weak: ${unsafe.weak} (${unsafe.reason ?? "ok"})`,
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
    ["scripts/check-db-credentials.mjs"],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        POSTGRES_PASSWORD: env.POSTGRES_PASSWORD ?? "",
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
  const hasCheck = dockerfile.includes("scripts/check-db-credentials.mjs");
  record(
    "Dockerfile runs Postgres credential check before migrate/start",
    hasCheck,
    `check-db-credentials.mjs in CMD: ${hasCheck}`,
  );
}

function formatEvidence() {
  const passed = errors.length === 0;
  const lines = [
    "Compose Postgres host exposure / default credentials removed: evidence",
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
  checkDevOverlay();
  checkEnvExample();
  checkPolicyHelpers();
  checkDockerfileEntrypoint();

  checkEntrypointScript(
    "check-db-credentials exits when POSTGRES_PASSWORD unset",
    { POSTGRES_PASSWORD: "" },
    {
      status: 1,
      outputIncludes: ["POSTGRES_PASSWORD must be set"],
    },
  );

  checkEntrypointScript(
    "check-db-credentials exits on legacy stickyboard password",
    { POSTGRES_PASSWORD: "stickyboard" },
    {
      status: 1,
      outputIncludes: ["weak Postgres credentials"],
    },
  );

  checkEntrypointScript(
    "check-db-credentials accepts strong generated password",
    { POSTGRES_PASSWORD: STRONG_DB_PASSWORD },
    {
      status: 0,
      outputIncludes: ["Postgres credentials OK"],
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
