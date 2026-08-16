import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  bodyFromPreview,
  isStickyColor,
  previewFromBody,
  serializeNote,
} from "@/lib/notes";
import { clampNotePositionForStorage } from "@/lib/note-bounds";

type Params = { params: Promise<{ id: string }> };

async function getOwnedNote(noteId: string, userId: string) {
  // Soft-deleted notes are only mutable via the trash restore/purge flow.
  const note = await prisma.note.findFirst({
    where: { id: noteId, deletedAt: null },
    include: { board: true },
  });
  if (!note) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (note.board.type === "private" && note.board.ownerUserId !== userId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { note };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;
  const { id } = await params;
  const result = await getOwnedNote(id, user.id);
  if ("error" in result && result.error) return result.error;
  const existing = result.note!;

  const body = (await request.json()) as {
    title?: string;
    preview?: string;
    color?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    zIndex?: number;
    rotation?: number;
  };

  const nextWidth = body.width ?? existing.width;
  const nextHeight = body.height ?? existing.height;
  const nextX = body.x ?? existing.x;
  const nextY = body.y ?? existing.y;
  const { x, y } = clampNotePositionForStorage(nextX, nextY, {
    width: nextWidth,
    height: nextHeight,
  });

  const updated = await prisma.note.updateMany({
    where: { id: existing.id, deletedAt: null },
    data: {
      title: body.title ?? existing.title,
      ...(body.preview !== undefined
        ? { bodyJson: bodyFromPreview(body.preview) }
        : {}),
      color: body.color && isStickyColor(body.color) ? body.color : existing.color,
      x,
      y,
      width: nextWidth,
      height: nextHeight,
      zIndex: body.zIndex ?? existing.zIndex,
      rotation: body.rotation ?? existing.rotation,
      updatedById: user.id,
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const note = await prisma.note.findUnique({ where: { id: existing.id } });
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    note: {
      ...serializeNote(note),
      preview:
        body.preview !== undefined
          ? body.preview
          : previewFromBody(note.bodyJson),
    },
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;
  const { id } = await params;
  const result = await getOwnedNote(id, user.id);
  if ("error" in result && result.error) return result.error;

  const note = await prisma.note.update({
    where: { id: result.note!.id },
    data: {
      deletedAt: new Date(),
      updatedById: user.id,
    },
  });

  return NextResponse.json({ note: serializeNote(note) });
}
