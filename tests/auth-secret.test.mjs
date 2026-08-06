import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BETTER_AUTH_SECRET_MIN_LENGTH,
  assessBetterAuthSecret,
  ensureBetterAuthSecret,
  generateBetterAuthSecret,
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

test("docker-compose.yml has no forgeable BETTER_AUTH_SECRET default", () => {
  const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");
  assert.match(compose, /BETTER_AUTH_SECRET:\s*\$\{BETTER_AUTH_SECRET:-?\}/);
  assert.doesNotMatch(compose, /BETTER_AUTH_SECRET:-[^}\s]+/);
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

test("ensureBetterAuthSecret auto-generates and persists when unset", () => {
  const dir = mkdtempSync(join(tmpdir(), "stickyboard-auth-secret-"));
  const persistPath = join(dir, ".better-auth-secret");
  try {
    const first = ensureBetterAuthSecret({
      secret: "",
      persistPath,
      allowGenerate: true,
      required: true,
    });
    assert.equal(first.action, "proceed");
    assert.equal(first.source, "generated");
    assert.equal(assessBetterAuthSecret(first.secret).weak, false);
    assert.equal(readFileSync(persistPath, "utf8").trim(), first.secret);

    const second = ensureBetterAuthSecret({
      secret: "",
      persistPath,
      allowGenerate: true,
      required: true,
    });
    assert.equal(second.action, "proceed");
    assert.equal(second.source, "file");
    assert.equal(second.secret, first.secret);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ensureBetterAuthSecret rejects weak env even when generate is allowed", () => {
  const dir = mkdtempSync(join(tmpdir(), "stickyboard-auth-secret-"));
  const persistPath = join(dir, ".better-auth-secret");
  try {
    const weak = ensureBetterAuthSecret({
      secret: "change-me-to-a-long-random-string",
      persistPath,
      allowGenerate: true,
      required: true,
    });
    assert.equal(weak.action, "skip");
    assert.match(weak.error ?? "", /weak Better Auth secret/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generateBetterAuthSecret returns a strong unique value", () => {
  const a = generateBetterAuthSecret();
  const b = generateBetterAuthSecret();
  assert.equal(assessBetterAuthSecret(a).weak, false);
  assert.equal(assessBetterAuthSecret(b).weak, false);
  assert.notEqual(a, b);
});

test("check-auth-secret fails closed on weak secret; generates when unset with persist path", () => {
  assert.throws(
    () =>
      checkAuthSecret(
        { BETTER_AUTH_SECRET: "change-me-to-a-long-random-string" },
        { required: true, allowGenerate: false },
      ),
    /weak Better Auth secret/,
  );

  const dir = mkdtempSync(join(tmpdir(), "stickyboard-auth-secret-"));
  const persistPath = join(dir, ".better-auth-secret");
  try {
    const generated = checkAuthSecret(
      { BETTER_AUTH_SECRET: "" },
      { required: true, persistPath, allowGenerate: true },
    );
    assert.equal(generated.action, "proceed");
    assert.equal(generated.source, "generated");

    writeFileSync(persistPath, `${STRONG_AUTH_SECRET}\n`, "utf8");
    const fromFile = checkAuthSecret(
      { BETTER_AUTH_SECRET: "" },
      { required: true, persistPath, allowGenerate: true },
    );
    assert.equal(fromFile.action, "proceed");
    assert.equal(fromFile.source, "file");
    assert.equal(fromFile.secret, STRONG_AUTH_SECRET);

    const ok = checkAuthSecret(
      { BETTER_AUTH_SECRET: STRONG_AUTH_SECRET },
      { required: true, allowGenerate: false },
    );
    assert.equal(ok.action, "proceed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\nAll auth-secret tests passed");
