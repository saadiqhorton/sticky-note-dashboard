import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  bodyFromPreview,
  resolveBoard,
  serializeNote,
} from "@/lib/notes";
import {
  clampNotePositionForStorage,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
} from "@/lib/note-bounds";

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;
  const boardParam = request.nextUrl.searchParams.get("board");
  const board = await resolveBoard(boardParam, user.id);

  if (board.type === "private" && board.ownerUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const notes = await prisma.note.findMany({
    where: {
      boardId: board.id,
      deletedAt: null,
    },
    orderBy: { zIndex: "asc" },
  });

  return NextResponse.json({
    board: { id: board.id, type: board.type, name: board.name },
    notes: notes.map(serializeNote),
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;
  const body = (await request.json()) as {
    board?: string;
    x?: number;
    y?: number;
    title?: string;
  };

  const board = await resolveBoard(body.board ?? "team", user.id);
  if (board.type === "private" && board.ownerUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const maxZ = await prisma.note.aggregate({
    where: { boardId: board.id, deletedAt: null },
    _max: { zIndex: true },
  });

  const { x, y } = clampNotePositionForStorage(
    body.x ?? 140,
    body.y ?? 160,
    { width: DEFAULT_NOTE_WIDTH, height: DEFAULT_NOTE_HEIGHT },
  );

  const note = await prisma.note.create({
    data: {
      boardId: board.id,
      title: body.title?.trim() || "Untitled",
      bodyJson: bodyFromPreview(""),
      x,
      y,
      zIndex: (maxZ._max.zIndex ?? 0) + 1,
      rotation: Math.round((Math.random() * 6 - 3) * 10) / 10,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  return NextResponse.json({ note: serializeNote(note) }, { status: 201 });
}
