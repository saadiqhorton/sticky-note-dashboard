import { prisma } from "@/lib/prisma";
import type { Note, StickyColor } from "@prisma/client";
import type { StickyColorKey } from "@/lib/theme";

export function previewFromBody(bodyJson: unknown): string {
  if (!bodyJson || typeof bodyJson !== "object") return "";
  const record = bodyJson as { text?: string };
  return record.text ?? "";
}

export function bodyFromPreview(preview: string) {
  return { text: preview };
}

export function serializeNote(note: Note) {
  return {
    id: note.id,
    title: note.title,
    preview: previewFromBody(note.bodyJson),
    color: note.color as StickyColorKey,
    x: note.x,
    y: note.y,
    width: note.width,
    height: note.height,
    zIndex: note.zIndex,
    rotation: note.rotation,
    updatedAt: note.updatedAt.toISOString(),
    editingBy: null as string | null,
  };
}

export async function getOrCreatePrivateBoard(userId: string) {
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

export async function getCompanyBoard() {
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

export async function resolveBoard(
  boardParam: string | null,
  userId: string,
) {
  if (boardParam === "private") {
    return getOrCreatePrivateBoard(userId);
  }
  // "team", "company" (legacy), or missing → shared team board
  return getCompanyBoard();
}

export function isStickyColor(value: string): value is StickyColor {
  return ["yellow", "pink", "blue", "green"].includes(value);
}
