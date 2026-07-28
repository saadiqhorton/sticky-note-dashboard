"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function createInvite(formData: FormData) {
  const { user } = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim() || null;

  await prisma.invite.create({
    data: {
      email,
      createdById: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    },
  });

  revalidatePath("/admin");
}

export async function deactivateUser(userId: string) {
  const { user } = await requireAdmin();
  if (user.id === userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { active: false },
  });

  revalidatePath("/admin");
}
