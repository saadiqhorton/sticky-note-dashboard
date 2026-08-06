import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/invites/[token]/accept/route";

loadEnv({ path: resolve(import.meta.dirname, "../.env") });

const stamp = Date.now();
const HINT_EMAIL = `Hint.User.${stamp}@Example.COM`;
const MATCH_EMAIL = `hint.user.${stamp}@example.com`;
const MISMATCH_EMAIL = `other.user.${stamp}@example.com`;
const OPEN_EMAIL = `open.invite.${stamp}@example.com`;
const EVIDENCE_PATH =
  process.env.INVITE_EMAIL_HINT_EVIDENCE_PATH ??
  resolve(import.meta.dirname, "../tmp/invite-email-hint-evidence.txt");

type CaseResult = {
  name: string;
  status: number;
  body: unknown;
  userCreated: boolean;
  inviteUsed: boolean;
};

type Evidence = {
  passed: boolean;
  cases: CaseResult[];
  errors: string[];
};

async function createInvite(
  prisma: PrismaClient,
  createdById: string,
  email: string | null,
) {
  return prisma.invite.create({
    data: {
      email,
      createdById,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });
}

async function acceptInvite(
  token: string,
  payload: { name: string; email: string; password: string },
) {
  const request = new NextRequest(
    `http://localhost:3000/api/invites/${token}/accept`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return POST(request, { params: Promise.resolve({ token }) });
}

async function runCase(
  prisma: PrismaClient,
  createdById: string,
  name: string,
  inviteEmail: string | null,
  acceptEmail: string,
  expectStatus: number,
  expectUser: boolean,
  expectInviteUsed: boolean,
): Promise<{ result: CaseResult; errors: string[] }> {
  const errors: string[] = [];
  const invite = await createInvite(prisma, createdById, inviteEmail);

  const response = await acceptInvite(invite.token, {
    name: "Invitee",
    email: acceptEmail,
    password: "password12345",
  });
  const body = await response.json().catch(() => null);
  const normalizedEmail = acceptEmail.trim().toLowerCase();
  const userCount = await prisma.user.count({
    where: { email: normalizedEmail },
  });
  const refreshed = await prisma.invite.findUniqueOrThrow({
    where: { id: invite.id },
  });

  const result: CaseResult = {
    name,
    status: response.status,
    body,
    userCreated: userCount > 0,
    inviteUsed: refreshed.usedAt !== null,
  };

  if (response.status !== expectStatus) {
    errors.push(
      `${name}: expected HTTP ${expectStatus}, got ${response.status}`,
    );
  }
  if (result.userCreated !== expectUser) {
    errors.push(
      `${name}: expected userCreated=${expectUser}, got ${result.userCreated}`,
    );
  }
  if (result.inviteUsed !== expectInviteUsed) {
    errors.push(
      `${name}: expected inviteUsed=${expectInviteUsed}, got ${result.inviteUsed}`,
    );
  }

  return { result, errors };
}

async function run(): Promise<Evidence> {
  const evidence: Evidence = { passed: false, cases: [], errors: [] };
  const prisma = new PrismaClient();

  try {
    const creator = await prisma.user.create({
      data: {
        name: "Invite Creator",
        email: `invite-creator-${stamp}@example.com`,
        role: "admin",
        active: true,
        emailVerified: true,
      },
    });

    const mismatch = await runCase(
      prisma,
      creator.id,
      "hinted invite rejects mismatched email",
      HINT_EMAIL,
      MISMATCH_EMAIL,
      400,
      false,
      false,
    );
    evidence.cases.push(mismatch.result);
    evidence.errors.push(...mismatch.errors);

    if (
      (mismatch.result.body as { error?: string } | null)?.error !==
      "Email does not match this invite"
    ) {
      evidence.errors.push(
        `hinted invite rejects mismatched email: expected error "Email does not match this invite", got ${JSON.stringify(mismatch.result.body)}`,
      );
    }

    const match = await runCase(
      prisma,
      creator.id,
      "hinted invite accepts case-insensitive match",
      HINT_EMAIL,
      MATCH_EMAIL,
      200,
      true,
      true,
    );
    evidence.cases.push(match.result);
    evidence.errors.push(...match.errors);

    const open = await runCase(
      prisma,
      creator.id,
      "open invite still accepts any email",
      null,
      OPEN_EMAIL,
      200,
      true,
      true,
    );
    evidence.cases.push(open.result);
    evidence.errors.push(...open.errors);

    evidence.passed = evidence.errors.length === 0;
    return evidence;
  } finally {
    await prisma.$disconnect();
  }
}

function formatEvidence(result: Evidence): string {
  const lines = [
    "Invite email hint enforcement: integration evidence",
    `timestamp: ${new Date().toISOString()}`,
    "",
  ];

  for (const c of result.cases) {
    lines.push(
      `=== ${c.name} ===`,
      `status: ${c.status}`,
      `body: ${JSON.stringify(c.body, null, 2)}`,
      `userCreated: ${c.userCreated}`,
      `inviteUsed: ${c.inviteUsed}`,
      "",
    );
  }

  lines.push("=== result ===", result.passed ? "PASS" : "FAIL");
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
  console.log(`\nEvidence written to ${EVIDENCE_PATH}`);

  if (!result.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
