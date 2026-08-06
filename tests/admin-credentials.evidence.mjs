/**
 * Evidence-driven checks for removing default Docker admin credentials:
 * compose has no defaults, and production bootstrap fails closed when
 * ADMIN_* is unset or weak.
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
  assessAdminPassword,
  resolveAdminBootstrapCredentials,
} from "../scripts/lib/admin-credentials.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const EVIDENCE_PATH =
  process.env.ADMIN_CREDENTIALS_EVIDENCE_PATH ??
  resolve(root, "tmp/admin-credentials-evidence.txt");

/** @type {{ name: string, passed: boolean, detail: string }[]} */
const checks = [];
const errors = [];

function record(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) errors.push(`${name}: ${detail}`);
}

function runBootstrap(env) {
  const result = spawnSync(process.execPath, ["scripts/bootstrap.mjs"], {
    cwd: root,
    env: {
      // Minimal env — do not inherit a host DATABASE_URL that could let a
      // bad case proceed past credential checks into a real database.
      PATH: process.env.PATH,
      NODE_ENV: env.NODE_ENV,
      ADMIN_EMAIL: env.ADMIN_EMAIL,
      ADMIN_PASSWORD: env.ADMIN_PASSWORD,
      ADMIN_NAME: env.ADMIN_NAME,
    },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error) : null,
  };
}

function checkComposeDefaults() {
  const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");
  const hasBareEmail = /ADMIN_EMAIL:\s*\$\{ADMIN_EMAIL\}/.test(compose);
  const hasBarePassword = /ADMIN_PASSWORD:\s*\$\{ADMIN_PASSWORD\}/.test(compose);
  const hasDefaultEmail = /ADMIN_EMAIL:-\S+/.test(compose);
  const hasDefaultPassword = /ADMIN_PASSWORD:-\S+/.test(compose);
  const hasLegacyEmail = compose.includes("admin@example.com");
  const hasLegacyPassword = compose.includes("changeme123");

  const passed =
    hasBareEmail &&
    hasBarePassword &&
    !hasDefaultEmail &&
    !hasDefaultPassword &&
    !hasLegacyEmail &&
    !hasLegacyPassword;

  record(
    "docker-compose.yml has no ADMIN_EMAIL/ADMIN_PASSWORD defaults",
    passed,
    [
      `bare ADMIN_EMAIL interpolation: ${hasBareEmail}`,
      `bare ADMIN_PASSWORD interpolation: ${hasBarePassword}`,
      `default ADMIN_EMAIL syntax present: ${hasDefaultEmail}`,
      `default ADMIN_PASSWORD syntax present: ${hasDefaultPassword}`,
      `contains admin@example.com: ${hasLegacyEmail}`,
      `contains changeme123: ${hasLegacyPassword}`,
    ].join("\n  "),
  );
}

function checkEnvExample() {
  const example = readFileSync(resolve(root, ".env.example"), "utf8");
  const hasLegacyPassword = example.includes("changeme123");
  const hasLegacyEmailDefault = /ADMIN_EMAIL="admin@example.com"/.test(example);
  record(
    ".env.example does not ship the old default admin credentials",
    !hasLegacyPassword && !hasLegacyEmailDefault,
    [
      `contains changeme123: ${hasLegacyPassword}`,
      `ADMIN_EMAIL=\"admin@example.com\": ${hasLegacyEmailDefault}`,
      `ADMIN_EMAIL line: ${example.match(/^ADMIN_EMAIL=.*$/m)?.[0] ?? "(missing)"}`,
      `ADMIN_PASSWORD line: ${example.match(/^ADMIN_PASSWORD=.*$/m)?.[0] ?? "(missing)"}`,
    ].join("\n  "),
  );
}

function checkPolicyHelpers() {
  const weak = assessAdminPassword("changeme123");
  const strong = assessAdminPassword("CorrectHorseBattery1");
  const missingProd = resolveAdminBootstrapCredentials({
    email: "",
    password: "",
    isProduction: true,
  });
  const weakProd = resolveAdminBootstrapCredentials({
    email: "admin@example.com",
    password: "changeme123",
    isProduction: true,
  });
  const okProd = resolveAdminBootstrapCredentials({
    email: "ops@example.com",
    password: "CorrectHorseBattery1",
    isProduction: true,
  });
  const skipDev = resolveAdminBootstrapCredentials({
    email: "",
    password: "",
    isProduction: false,
  });

  const passed =
    weak.weak === true &&
    strong.weak === false &&
    Boolean(missingProd.error) &&
    Boolean(weakProd.error) &&
    okProd.action === "proceed" &&
    skipDev.action === "skip" &&
    !skipDev.error;

  record(
    "credential policy helpers reject weak / missing production values",
    passed,
    [
      `changeme123 weak: ${weak.weak} (${weak.reason ?? "ok"})`,
      `CorrectHorseBattery1 weak: ${strong.weak}`,
      `prod missing error: ${missingProd.error ?? "none"}`,
      `prod weak error: ${weakProd.error ?? "none"}`,
      `prod strong action: ${okProd.action}`,
      `dev unset action: ${skipDev.action}`,
    ].join("\n  "),
  );
}

function checkBootstrapProcess(name, env, expect) {
  const result = runBootstrap(env);
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
      `spawn error: ${result.error ?? "none"}`,
      `expected output snippets: ${JSON.stringify(expect.outputIncludes)}`,
      "--- stdout ---",
      result.stdout.trim() || "(empty)",
      "--- stderr ---",
      result.stderr.trim() || "(empty)",
    ].join("\n  "),
  );
}

function checkDevUnsetDoesNotHardFail() {
  const result = runBootstrap({ NODE_ENV: "development" });
  const combined = `${result.stdout}\n${result.stderr}`;
  const prodError = combined.includes(
    "Production bootstrap requires ADMIN_EMAIL and ADMIN_PASSWORD",
  );
  record(
    "non-production unset credentials do not use production hard-fail message",
    !prodError,
    [
      `exit status: ${result.status}`,
      `production hard-fail message present: ${prodError}`,
      "--- stdout ---",
      result.stdout.trim() || "(empty)",
      "--- stderr ---",
      result.stderr.trim() || "(empty)",
    ].join("\n  "),
  );
}

function checkStrongCredentialsPassGate() {
  const result = runBootstrap({
    NODE_ENV: "production",
    ADMIN_EMAIL: "ops@example.com",
    ADMIN_PASSWORD: "CorrectHorseBattery1",
  });
  const combined = `${result.stdout}\n${result.stderr}`;
  const credentialFail =
    combined.includes("requires ADMIN_EMAIL and ADMIN_PASSWORD") ||
    combined.includes("weak admin credentials");
  const reachedDb =
    combined.includes("Prisma") ||
    combined.includes("DATABASE_URL") ||
    combined.includes("Can't reach database") ||
    combined.includes("Environment variable not found") ||
    combined.includes("ECONNREFUSED") ||
    combined.includes("error: Environment variable not found") ||
    result.status === 0;

  record(
    "production strong credentials pass credential gate (DB may still fail offline)",
    !credentialFail && reachedDb,
    [
      `exit status: ${result.status}`,
      `credential hard-fail present: ${credentialFail}`,
      `reached DB / prisma layer: ${reachedDb}`,
      "--- stdout ---",
      result.stdout.trim() || "(empty)",
      "--- stderr ---",
      result.stderr.trim() || "(empty)",
    ].join("\n  "),
  );
}

function formatEvidence() {
  const passed = errors.length === 0;
  const lines = [
    "Default Docker admin credentials removed: evidence",
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

  checkBootstrapProcess(
    "production bootstrap exits when ADMIN_* unset",
    { NODE_ENV: "production" },
    {
      status: 1,
      outputIncludes: [
        "Production bootstrap requires ADMIN_EMAIL and ADMIN_PASSWORD to be set",
      ],
    },
  );

  checkBootstrapProcess(
    "production bootstrap exits on legacy weak password changeme123",
    {
      NODE_ENV: "production",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "changeme123",
    },
    {
      status: 1,
      outputIncludes: ["weak admin credentials"],
    },
  );

  checkDevUnsetDoesNotHardFail();
  checkStrongCredentialsPassGate();

  const { passed, output } = formatEvidence();
  mkdirSync(resolve(EVIDENCE_PATH, ".."), { recursive: true });
  writeFileSync(EVIDENCE_PATH, output, "utf8");
  console.log(output);
  console.log(`\nEvidence written to ${EVIDENCE_PATH}`);
  console.log(`Evidence file exists: ${existsSync(EVIDENCE_PATH)}`);

  if (!passed) process.exit(1);
}

main();
