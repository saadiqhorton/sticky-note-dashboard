import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  POSTGRES_PASSWORD_MIN_LENGTH,
  assessPostgresPassword,
  resolvePostgresCredentials,
} from "../scripts/lib/postgres-credentials.mjs";
import { main as checkDbCredentials } from "../scripts/check-db-credentials.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

test("docker-compose.yml does not publish Postgres and has no default password", () => {
  const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");
  assert.match(compose, /POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD\}/);
  assert.doesNotMatch(compose, /POSTGRES_PASSWORD:-\S+/);
  assert.doesNotMatch(compose, /POSTGRES_PASSWORD:\s*stickyboard/);
  assert.doesNotMatch(compose, /5433:5432/);
  assert.doesNotMatch(compose, /["']?\d+:5432["']?/);
  assert.match(
    compose,
    /DATABASE_URL:\s*postgresql:\/\/stickyboard:\$\{POSTGRES_PASSWORD\}@db:5432\/stickyboard/,
  );
});

test("docker-compose.dev.yml optionally publishes Postgres for local npm run dev", () => {
  const overlay = readFileSync(resolve(root, "docker-compose.dev.yml"), "utf8");
  assert.match(overlay, /127\.0\.0\.1:5433:5432/);
  assert.doesNotMatch(overlay, /^\s*-\s*["']?5433:5432["']?\s*$/m);
});

test(".env.example does not ship stickyboard/stickyboard defaults", () => {
  const example = readFileSync(resolve(root, ".env.example"), "utf8");
  assert.match(example, /^POSTGRES_PASSWORD=/m);
  assert.doesNotMatch(
    example,
    /postgresql:\/\/stickyboard:stickyboard@/,
  );
  assert.doesNotMatch(example, /POSTGRES_PASSWORD=["']?stickyboard["']?/);
});

const STRONG_DB_PASSWORD = "deadbeef0123456789abcdef01234567";

test("assessPostgresPassword rejects empty, short, default, and unsafe values", () => {
  assert.equal(assessPostgresPassword("").weak, true);
  assert.equal(assessPostgresPassword("short1").weak, true);
  assert.equal(assessPostgresPassword("stickyboard").weak, true);
  assert.equal(
    assessPostgresPassword("a".repeat(POSTGRES_PASSWORD_MIN_LENGTH)).weak,
    true,
  );
  assert.equal(assessPostgresPassword("CorrectHorseBattery1!").weak, true);
  assert.equal(assessPostgresPassword(`${"a".repeat(15)}1`).weak, false);
  assert.equal(assessPostgresPassword(STRONG_DB_PASSWORD).weak, false);
});

test("resolvePostgresCredentials requires strong password when required", () => {
  const missing = resolvePostgresCredentials({
    password: "",
    required: true,
  });
  assert.equal(missing.action, "skip");
  assert.match(missing.error ?? "", /POSTGRES_PASSWORD must be set/);

  const weak = resolvePostgresCredentials({
    password: "stickyboard",
    required: true,
  });
  assert.equal(weak.action, "skip");
  assert.match(weak.error ?? "", /weak Postgres credentials/);

  const paddedWeak = resolvePostgresCredentials({
    password: "  stickyboard  ",
    required: true,
  });
  assert.equal(paddedWeak.action, "skip");
  assert.match(paddedWeak.error ?? "", /weak Postgres credentials/);

  const ok = resolvePostgresCredentials({
    password: `  ${STRONG_DB_PASSWORD}  `,
    required: true,
  });
  assert.equal(ok.action, "proceed");
  assert.equal(ok.password, STRONG_DB_PASSWORD);
});

test("check-db-credentials fails closed on missing/weak production password", () => {
  assert.throws(
    () => checkDbCredentials({ POSTGRES_PASSWORD: "" }, { required: true }),
    /POSTGRES_PASSWORD must be set/,
  );
  assert.throws(
    () =>
      checkDbCredentials(
        { POSTGRES_PASSWORD: "stickyboard" },
        { required: true },
      ),
    /weak Postgres credentials/,
  );
  const ok = checkDbCredentials(
    { POSTGRES_PASSWORD: STRONG_DB_PASSWORD },
    { required: true },
  );
  assert.equal(ok.action, "proceed");
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\nAll postgres-credentials tests passed");
