/**
 * Smoke test for admin credential bootstrap (Docker-equivalent path without
 * requiring the Docker daemon). Uses local Postgres + NODE_ENV=production.
 *
 * Evidence lands under tmp/ (gitignored).
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { auth } from "../src/lib/auth";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
loadEnv({ path: resolve(root, ".env") });

const EVIDENCE_PATH =
  process.env.ADMIN_SMOKE_EVIDENCE_PATH ??
  resolve(root, "tmp/admin-credentials-smoke-evidence.txt");

const ADMIN_EMAIL =
  process.env.SMOKE_ADMIN_EMAIL ?? "smoke-admin@example.com";
const ADMIN_PASSWORD =
  process.env.SMOKE_ADMIN_PASSWORD ?? "SmokeTestPassw0rd!";
const ORIGIN =
  process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";

/** @type {{ name: string, passed: boolean, detail: string }[]} */
const checks = [];
const errors = [];

function record(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) errors.push(`${name}: ${detail}`);
}

function runNode(args, env) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...env,
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

function runNpm(args, env) {
  const result = spawnSync("npm", args, {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...env,
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

function baseEnv(overrides = {}) {
  return {
    NODE_ENV: "production",
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://stickyboard:stickyboard@127.0.0.1:5432/stickyboard",
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? "smoke-test-secret-not-for-production",
    BETTER_AUTH_URL: ORIGIN,
    APP_URL: ORIGIN,
    ...overrides,
  };
}

async function cleanupSmokeUser(prisma) {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!existing) return;
  await prisma.account.deleteMany({ where: { userId: existing.id } });
  await prisma.session.deleteMany({ where: { userId: existing.id } });
  await prisma.board.deleteMany({
    where: { type: "private", ownerUserId: existing.id },
  });
  await prisma.user.delete({ where: { id: existing.id } });
}

async function main() {
  const prisma = new PrismaClient();

  try {
    // --- fail closed: unset ---
    {
      const result = runNode(["scripts/bootstrap.mjs"], baseEnv({
        ADMIN_EMAIL: "",
        ADMIN_PASSWORD: "",
      }));
      const combined = `${result.stdout}\n${result.stderr}`;
      const passed =
        result.status === 1 &&
        combined.includes(
          "Production bootstrap requires ADMIN_EMAIL and ADMIN_PASSWORD to be set",
        );
      record(
        "production bootstrap fails when ADMIN_* unset",
        passed,
        `status=${result.status}\n${combined.trim()}`,
      );
    }

    // --- fail closed: weak ---
    {
      const result = runNode(["scripts/bootstrap.mjs"], baseEnv({
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "changeme123",
      }));
      const combined = `${result.stdout}\n${result.stderr}`;
      const passed =
        result.status === 1 && combined.includes("weak admin credentials");
      record(
        "production bootstrap fails on changeme123",
        passed,
        `status=${result.status}\n${combined.trim()}`,
      );
    }

    // --- migrate ---
    {
      const result = runNpm(["run", "db:deploy"], baseEnv());
      const passed = result.status === 0;
      record(
        "prisma migrate deploy succeeds",
        passed,
        `status=${result.status}\n${(result.stdout + result.stderr).trim()}`,
      );
      if (!passed) return finish();
    }

    await cleanupSmokeUser(prisma);

    // --- bootstrap success ---
    {
      const result = runNode(["scripts/bootstrap.mjs"], baseEnv({
        ADMIN_EMAIL,
        ADMIN_PASSWORD,
        ADMIN_NAME: "Smoke Admin",
      }));
      const combined = `${result.stdout}\n${result.stderr}`;
      const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
      const passed =
        result.status === 0 &&
        combined.includes(`Created admin: ${ADMIN_EMAIL}`) &&
        user?.role === "admin";
      record(
        "production bootstrap creates admin with strong credentials",
        passed,
        [
          `status=${result.status}`,
          `user role=${user?.role ?? "missing"}`,
          combined.trim(),
        ].join("\n"),
      );
      if (!passed) return finish();
    }

    // --- sign-in ---
    {
      const response = await auth.handler(
        new Request(`${ORIGIN}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: ORIGIN,
          },
          body: JSON.stringify({
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD,
          }),
        }),
      );
      const body = await response.json().catch(() => null);
      const setCookie = response.headers.getSetCookie?.() ?? [];
      const hasSessionCookie = setCookie.some((c) =>
        /session_token|better-auth/i.test(c),
      );
      const passed =
        response.ok &&
        Boolean(body?.user?.email === ADMIN_EMAIL || body?.user?.id) &&
        (hasSessionCookie || Boolean(body?.user));
      record(
        "admin can sign in with bootstrap credentials",
        passed,
        [
          `status=${response.status}`,
          `body=${JSON.stringify(body)}`,
          `set-cookie count=${setCookie.length}`,
          `hasSessionCookie=${hasSessionCookie}`,
        ].join("\n"),
      );
    }

    // --- docker absent note ---
    {
      const docker = spawnSync("docker", ["--version"], { encoding: "utf8" });
      record(
        "docker compose path note",
        true,
        docker.status === 0
          ? `docker available: ${(docker.stdout || "").trim()}`
          : "Docker daemon/CLI not available in this environment; ran local Postgres production-equivalent smoke instead of `docker compose up --build`.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  finish();

  function finish() {
    const passed = errors.length === 0;
    const lines = [
      "Admin credentials Docker-equivalent smoke: evidence",
      `timestamp: ${new Date().toISOString()}`,
      `node: ${process.version}`,
      `cwd: ${root}`,
      `admin email: ${ADMIN_EMAIL}`,
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
    const output = lines.join("\n");
    mkdirSync(resolve(EVIDENCE_PATH, ".."), { recursive: true });
    writeFileSync(EVIDENCE_PATH, output, "utf8");
    console.log(output);
    console.log(`\nEvidence written to ${EVIDENCE_PATH}`);
    console.log(`Evidence file exists: ${existsSync(EVIDENCE_PATH)}`);
    if (!passed) process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
