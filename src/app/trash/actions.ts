"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function restoreNote(noteId: string) {
  const { user } = await requireUser();
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { board: true },
  });
  if (!note) return;
  if (note.board.type === "private" && note.board.ownerUserId !== user.id) {
    return;
  }

  await prisma.note.update({
    where: { id: noteId },
    data: { deletedAt: null, updatedById: user.id },
  });
  revalidatePath("/trash");
  revalidatePath("/");
}

export async function purgeNote(noteId: string) {
  await requireAdmin();
  await prisma.note.delete({ where: { id: noteId } });
  revalidatePath("/trash");
}
