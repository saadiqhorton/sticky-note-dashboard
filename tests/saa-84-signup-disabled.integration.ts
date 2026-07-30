import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { auth } from "../src/lib/auth";

loadEnv({ path: resolve(import.meta.dirname, "../.env") });

const TEST_EMAIL = `saa84-blocked-${Date.now()}@example.com`;
const ORIGIN =
  process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
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

  try {
    const beforeCount = await prisma.user.count({
      where: { email: TEST_EMAIL },
    });
    if (beforeCount !== 0) {
      evidence.errors.push(`Precondition failed: ${TEST_EMAIL} already exists`);
      return evidence;
    }

    // Exercise Better Auth's real sign-up handler against Postgres (no second
    // `next dev` — Next 16 refuses two dev servers in one workspace).
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
        },
        body: JSON.stringify({
          name: "Unauthorized Signup",
          email: TEST_EMAIL,
          password: "password12345",
        }),
      }),
    );

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

    if (!evidence.authTsSnippet.includes("disableSignUp: true")) {
      evidence.errors.push("auth.ts is missing disableSignUp: true");
    }

    evidence.passed = evidence.errors.length === 0;
    return evidence;
  } finally {
    await prisma.$disconnect();
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
    "=== POST /api/auth/sign-up/email (via auth.handler) ===",
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
