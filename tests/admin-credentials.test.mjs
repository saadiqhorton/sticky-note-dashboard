import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  assessAdminPassword,
  resolveAdminBootstrapCredentials,
} from "../scripts/lib/admin-credentials.mjs";

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

test("docker-compose.yml has no default ADMIN_EMAIL / ADMIN_PASSWORD", () => {
  const compose = readFileSync(resolve(root, "docker-compose.yml"), "utf8");
  assert.match(compose, /ADMIN_EMAIL:\s*\$\{ADMIN_EMAIL\}/);
  assert.match(compose, /ADMIN_PASSWORD:\s*\$\{ADMIN_PASSWORD\}/);
  assert.doesNotMatch(compose, /ADMIN_EMAIL:-\S+/);
  assert.doesNotMatch(compose, /ADMIN_PASSWORD:-\S+/);
  assert.doesNotMatch(compose, /admin@example\.com/);
  assert.doesNotMatch(compose, /changeme123/);
});

test("assessAdminPassword rejects empty, short, and known-weak values", () => {
  assert.equal(assessAdminPassword("").weak, true);
  assert.equal(assessAdminPassword("short1").weak, true);
  assert.equal(assessAdminPassword("changeme123").weak, true);
  assert.equal(assessAdminPassword("a".repeat(ADMIN_PASSWORD_MIN_LENGTH)).weak, true);
  assert.equal(
    assessAdminPassword(`Str0ngPass!${"x".repeat(4)}`).weak,
    false,
  );
});

test("production requires credentials and rejects weak passwords", () => {
  const missing = resolveAdminBootstrapCredentials({
    email: "",
    password: "",
    isProduction: true,
  });
  assert.equal(missing.action, "skip");
  assert.match(missing.error ?? "", /requires ADMIN_EMAIL and ADMIN_PASSWORD/);

  const weak = resolveAdminBootstrapCredentials({
    email: "admin@example.com",
    password: "changeme123",
    isProduction: true,
  });
  assert.equal(weak.action, "skip");
  assert.match(weak.error ?? "", /weak admin credentials/);

  const weakPadded = resolveAdminBootstrapCredentials({
    email: "admin@example.com",
    password: "  changeme123  ",
    isProduction: true,
  });
  assert.equal(weakPadded.action, "skip");
  assert.match(weakPadded.error ?? "", /weak admin credentials/);

  const ok = resolveAdminBootstrapCredentials({
    email: " Admin@Example.com ",
    password: "  CorrectHorseBattery1  ",
    isProduction: true,
  });
  assert.equal(ok.action, "proceed");
  assert.equal(ok.email, "admin@example.com");
  assert.equal(ok.password, "CorrectHorseBattery1");
});

test("non-production may skip when unset", () => {
  const skipped = resolveAdminBootstrapCredentials({
    email: undefined,
    password: undefined,
    isProduction: false,
  });
  assert.deepEqual(skipped, { action: "skip" });
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\nAll admin-credentials tests passed");
