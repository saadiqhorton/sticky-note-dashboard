import { PrismaClient } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { resolveAdminBootstrapCredentials } from "./lib/admin-credentials.mjs";

const prisma = new PrismaClient();

async function ensureCompanyBoard() {
  const existing = await prisma.board.findFirst({
    where: { type: "company" },
  });
  if (existing) return existing;

  return prisma.board.create({
    data: {
      type: "company",
      name: "Team Board",
    },
  });
}

async function ensureAdmin() {
  const name = process.env.ADMIN_NAME ?? "Admin";
  const resolved = resolveAdminBootstrapCredentials({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });

  if (resolved.error) {
    throw new Error(resolved.error);
  }

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

  return prisma.board.create({
    data: {
      type: "private",
      name: "My board",
      ownerUserId: userId,
    },
  });
}

async function main() {
  await ensureCompanyBoard();
  await ensureAdmin();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
