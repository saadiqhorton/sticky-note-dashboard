import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: resolve(import.meta.dirname, "../.env") });

const PORT = Number(process.env.TEST_PORT ?? "3456");
const BASE_URL = `http://localhost:${PORT}`;
const TEST_EMAIL = `saa84-blocked-${Date.now()}@example.com`;
const EVIDENCE_PATH =
  process.env.SAA84_EVIDENCE_PATH ??
  "/opt/cursor/artifacts/saa-84-signup-disabled-evidence.txt";

type Evidence = {
  passed: boolean;
  authTsSnippet: string;
  inviteAcceptRouteExists: boolean;
  signup: {
    status: number;
    body: unknown;
  };
  dbUserCreated: boolean;
  errors: string[];
};

async function waitForServer(url: string, maxAttempts = 90): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Server not ready yet.
    }
    await sleep(1000);
  }
  throw new Error(`Server did not become ready at ${url}`);
}

function startServer(): ChildProcess {
  return spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      PORT: String(PORT),
      BETTER_AUTH_URL: BASE_URL,
      APP_URL: BASE_URL,
      NEXT_PUBLIC_APP_URL: BASE_URL,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (!server.pid) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
  await sleep(1000);
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    if (!server.killed) server.kill("SIGKILL");
  }
}

function readAuthSnippet(): string {
  const authPath = resolve(import.meta.dirname, "../src/lib/auth.ts");
  const content = readFileSync(authPath, "utf8");
  const start = content.indexOf("emailAndPassword:");
  const end = content.indexOf("},", start) + 2;
  return content.slice(start, end);
}

async function run(): Promise<Evidence> {
  const evidence: Evidence = {
    passed: false,
    authTsSnippet: readAuthSnippet(),
    inviteAcceptRouteExists: existsSync(
      resolve(
        import.meta.dirname,
        "../src/app/api/invites/[token]/accept/route.ts",
      ),
    ),
    signup: { status: 0, body: null },
    dbUserCreated: false,
    errors: [],
  };

  const prisma = new PrismaClient();
  const server = startServer();

  try {
    await waitForServer(`${BASE_URL}/login`);

    const beforeCount = await prisma.user.count({
      where: { email: TEST_EMAIL },
    });
    if (beforeCount !== 0) {
      evidence.errors.push(`Precondition failed: ${TEST_EMAIL} already exists`);
      return evidence;
    }

    const response = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
      },
      body: JSON.stringify({
        name: "Unauthorized Signup",
        email: TEST_EMAIL,
        password: "password12345",
      }),
    });

    evidence.signup.status = response.status;
    evidence.signup.body = await response.json().catch(() => null);

    const afterCount = await prisma.user.count({
      where: { email: TEST_EMAIL },
    });
    evidence.dbUserCreated = afterCount > 0;

    if (response.status !== 400) {
      evidence.errors.push(`Expected HTTP 400, got ${response.status}`);
    }

    const body = evidence.signup.body as { code?: string } | null;
    if (body?.code !== "EMAIL_PASSWORD_SIGN_UP_DISABLED") {
      evidence.errors.push(
        `Expected code EMAIL_PASSWORD_SIGN_UP_DISABLED, got ${body?.code ?? "none"}`,
      );
    }

    if (evidence.dbUserCreated) {
      evidence.errors.push("User was created despite disabled sign-up");
    }

    if (!evidence.inviteAcceptRouteExists) {
      evidence.errors.push("Invite accept route is missing");
    }

    evidence.passed = evidence.errors.length === 0;
    return evidence;
  } finally {
    await prisma.$disconnect();
    await stopServer(server);
  }
}

function formatEvidence(result: Evidence): string {
  const lines = [
    "SAA-84: disable open email sign-up integration evidence",
    `timestamp: ${new Date().toISOString()}`,
    "",
    "=== auth.ts snippet ===",
    result.authTsSnippet,
    "",
    "=== invite accept route exists ===",
    String(result.inviteAcceptRouteExists),
    "",
    "=== POST /api/auth/sign-up/email ===",
    `status: ${result.signup.status}`,
    `body: ${JSON.stringify(result.signup.body, null, 2)}`,
    "",
    "=== database check ===",
    `user created for ${TEST_EMAIL}: ${result.dbUserCreated}`,
    "",
    "=== result ===",
    result.passed ? "PASS" : "FAIL",
  ];

  if (result.errors.length > 0) {
    lines.push("", "=== errors ===", ...result.errors);
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const result = await run();
  const output = formatEvidence(result);

  mkdirSync(resolve(EVIDENCE_PATH, ".."), { recursive: true });
  writeFileSync(EVIDENCE_PATH, output, "utf8");
  console.log(output);

  if (!result.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
