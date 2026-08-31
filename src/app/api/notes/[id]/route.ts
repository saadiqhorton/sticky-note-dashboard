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
import { broadcastNote } from "@/lib/realtime-hub";

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
    expectedUpdatedAt?: string;
  };
  // GAP-016: reject a stale save before writing (peer wrote first). The
  // expected-updatedAt check is folded into the conditional write below so
  // two concurrent PATCHes cannot both pass the check (TOCTOU-safe).
  const expectedUpdatedAt =
    body.expectedUpdatedAt !== undefined
      ? Date.parse(body.expectedUpdatedAt)
      : NaN;

  const isMove =
    body.x !== undefined ||
    body.y !== undefined ||
    body.zIndex !== undefined;

  const nextWidth = body.width ?? existing.width;
  const nextHeight = body.height ?? existing.height;
  const nextX = body.x ?? existing.x;
  const nextY = body.y ?? existing.y;
  const { x, y } = clampNotePositionForStorage(nextX, nextY, {
    width: nextWidth,
    height: nextHeight,
  });

  const data = {
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
  };

  // Conditional write: only lands when the note still exists, is not
  // soft-deleted, and (when the client sent a baseline) its updatedAt still
  // matches. A trashed note can therefore never be resurrected by a PATCH,
  // and two concurrent PATCHes cannot both pass the stale check.
  const updated = await prisma.note.updateMany({
    where: {
      id: existing.id,
      deletedAt: null,
      ...(Number.isFinite(expectedUpdatedAt)
        ? { updatedAt: new Date(expectedUpdatedAt) }
        : {}),
    },
    data,
  });

  if (updated.count === 0) {
    // Either the note is gone/trashed, or a peer wrote first.
    const current = await prisma.note.findUnique({
      where: { id: existing.id },
      include: { board: true },
    });
    if (!current || current.deletedAt) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      Number.isFinite(expectedUpdatedAt) &&
      current.updatedAt.getTime() > expectedUpdatedAt
    ) {
      return NextResponse.json(
        { error: "conflict", note: serializeNote(current) },
        { status: 409 },
      );
    }
    // The note exists but its updatedAt didn't match the client's baseline
    // (e.g. clock skew made the baseline newer than the server). Fall
    // through to an unconditional write so the save still lands.
    await prisma.note.update({ where: { id: existing.id }, data });
  }

  const note = await prisma.note.findUnique({ where: { id: existing.id } });
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const serialized = {
    ...serializeNote(note),
    preview:
      body.preview !== undefined
        ? body.preview
        : previewFromBody(note.bodyJson),
  };
  broadcastNote(existing.board.id, {
    event: isMove ? "note.moved" : "note.updated",
    data: { boardId: existing.board.id, note: serialized },
  });

  return NextResponse.json({
    note: serialized,
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
  broadcastNote(result.note!.board.id, {
    event: "note.deleted",
    data: { boardId: result.note!.board.id, noteId: result.note!.id },
  });

  return NextResponse.json({ note: serializeNote(note) });
}
