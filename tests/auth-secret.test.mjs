import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BETTER_AUTH_SECRET_MIN_LENGTH,
  assessBetterAuthSecret,
  resolveBetterAuthSecret,
} from "../scripts/lib/auth-secret.mjs";
import { main as checkAuthSecret } from "../scripts/check-auth-secret.mjs";

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

test("docker-compose.yml has no default BETTER_AUTH_SECRET", () => {
  const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");
  assert.match(compose, /BETTER_AUTH_SECRET:\s*\$\{BETTER_AUTH_SECRET\}/);
  assert.doesNotMatch(compose, /BETTER_AUTH_SECRET:-\S+/);
  assert.doesNotMatch(compose, /change-me-to-a-long-random-string/);
});

test(".env.example does not ship a forgeable BETTER_AUTH_SECRET default", () => {
  const example = readFileSync(resolve(root, ".env.example"), "utf8");
  assert.match(example, /^BETTER_AUTH_SECRET=/m);
  assert.doesNotMatch(example, /change-me-to-a-long-random-string/);
  assert.doesNotMatch(
    example,
    /BETTER_AUTH_SECRET=["']?replace-with-a-long-random-string["']?/,
  );
});

const STRONG_AUTH_SECRET = "deadbeef0123456789abcdef01234567";

test("assessBetterAuthSecret rejects empty, short, and known-weak values", () => {
  assert.equal(assessBetterAuthSecret("").weak, true);
  assert.equal(assessBetterAuthSecret("short1").weak, true);
  assert.equal(
    assessBetterAuthSecret("change-me-to-a-long-random-string").weak,
    true,
  );
  assert.equal(
    assessBetterAuthSecret("replace-with-a-long-random-string").weak,
    true,
  );
  assert.equal(
    assessBetterAuthSecret("a".repeat(BETTER_AUTH_SECRET_MIN_LENGTH)).weak,
    true,
  );
  assert.equal(
    assessBetterAuthSecret(`${"a".repeat(31)}1`).weak,
    false,
  );
  assert.equal(assessBetterAuthSecret(STRONG_AUTH_SECRET).weak, false);
});

test("resolveBetterAuthSecret requires strong secret when required", () => {
  const missing = resolveBetterAuthSecret({
    secret: "",
    required: true,
  });
  assert.equal(missing.action, "skip");
  assert.match(missing.error ?? "", /BETTER_AUTH_SECRET must be set/);

  const weak = resolveBetterAuthSecret({
    secret: "change-me-to-a-long-random-string",
    required: true,
  });
  assert.equal(weak.action, "skip");
  assert.match(weak.error ?? "", /weak Better Auth secret/);

  const paddedWeak = resolveBetterAuthSecret({
    secret: "  change-me-to-a-long-random-string  ",
    required: true,
  });
  assert.equal(paddedWeak.action, "skip");
  assert.match(paddedWeak.error ?? "", /weak Better Auth secret/);

  const ok = resolveBetterAuthSecret({
    secret: `  ${STRONG_AUTH_SECRET}  `,
    required: true,
  });
  assert.equal(ok.action, "proceed");
  assert.equal(ok.secret, STRONG_AUTH_SECRET);
});

test("check-auth-secret fails closed on missing/weak production secret", () => {
  assert.throws(
    () => checkAuthSecret({ BETTER_AUTH_SECRET: "" }, { required: true }),
    /BETTER_AUTH_SECRET must be set/,
  );
  assert.throws(
    () =>
      checkAuthSecret(
        { BETTER_AUTH_SECRET: "change-me-to-a-long-random-string" },
        { required: true },
      ),
    /weak Better Auth secret/,
  );
  const ok = checkAuthSecret(
    { BETTER_AUTH_SECRET: STRONG_AUTH_SECRET },
    { required: true },
  );
  assert.equal(ok.action, "proceed");
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\nAll auth-secret tests passed");
