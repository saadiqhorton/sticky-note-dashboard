import { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { pathToFileURL } from "node:url";
import { resolveAdminBootstrapCredentials } from "./lib/admin-credentials.mjs";

const prisma = new PrismaClient();

function isUniqueConstraintError(error) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function ensureCompanyBoard() {
  const existing = await prisma.board.findFirst({
    where: { type: "company" },
  });
  if (existing) return existing;

  try {
    return await prisma.board.create({
      data: {
        type: "company",
        name: "Team Board",
      },
    });
  } catch (error) {
    // Partial unique index Board_type_company_key — concurrent creates re-find.
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.board.findFirst({
        where: { type: "company" },
      });
      if (raced) return raced;
    }
    throw error;
  }
}

async function ensureAdmin(resolved) {
  const name = process.env.ADMIN_NAME ?? "Admin";

  if (resolved.action === "skip") {
    console.log("Skipping admin bootstrap: ADMIN_EMAIL / ADMIN_PASSWORD not set");
    return;
  }

  const { email, password } = resolved;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "admin") {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: "admin", active: true },
      });
    }
    await ensurePrivateBoard(existing.id);
    console.log(`Admin already exists: ${email}`);
    return existing;
  }

  const hashed = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role: "admin",
      active: true,
      emailVerified: true,
      accounts: {
        create: {
          accountId: email,
          providerId: "credential",
          password: hashed,
        },
      },
    },
  });

  await ensurePrivateBoard(user.id);
  console.log(`Created admin: ${email}`);
  return user;
}

async function ensurePrivateBoard(userId) {
  const existing = await prisma.board.findFirst({
    where: { type: "private", ownerUserId: userId },
  });
  if (existing) return existing;

  try {
    return await prisma.board.create({
      data: {
        type: "private",
        name: "My board",
        ownerUserId: userId,
      },
    });
  } catch (error) {
    // ownerUserId is unique — concurrent creates lose the race and re-find.
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.board.findFirst({
        where: { type: "private", ownerUserId: userId },
      });
      if (raced) return raced;
    }
    throw error;
  }
}

async function main() {
  // Fail closed in production before touching the database so missing/weak
  // admin credentials never reach Postgres (and can be evidence-tested offline).
  const resolved = resolveAdminBootstrapCredentials({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  if (resolved.error) {
    throw new Error(resolved.error);
  }

  await ensureCompanyBoard();
  await ensureAdmin(resolved);
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
