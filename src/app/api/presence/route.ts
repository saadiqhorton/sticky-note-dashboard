import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/session";
import { resolveBoard } from "@/lib/notes";
import { prisma } from "@/lib/prisma";
import { pingSubscriber, setEditing, setIdle } from "@/lib/realtime-hub";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  const body = (await request.json()) as {
    board?: string;
    action?: string;
    noteId?: string;
    clientId?: string;
  };

  const action = body.action;
  const noteId = body.noteId?.trim();
  const clientId = body.clientId?.trim();
  if (action !== "editing" && action !== "idle" && action !== "ping") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!clientId || clientId.length > 80) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const board = await resolveBoard(body.board ?? "team", user.id);
  if (board.type === "private" && board.ownerUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Connection liveness ping: only the owning user's connections.
  if (action === "ping") {
    pingSubscriber(board.id, clientId, user.id);
    return NextResponse.json({ ok: true });
  }

  if (!noteId) {
    return NextResponse.json({ error: "noteId required" }, { status: 400 });
  }
  // The claimed note must actually live on this board (no cross-board claims).
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { boardId: true },
  });
  if (!note || note.boardId !== board.id) {
    return NextResponse.json(
      { error: "noteId does not belong to this board" },
      { status: 400 },
    );
  }

  if (action === "editing") {
    const editor = setEditing(board.id, {
      clientId,
      noteId,
      userId: user.id,
      userName: user.name || user.email || "Someone",
    });
    if (!editor) {
      return NextResponse.json(
        { error: "clientId belongs to another user" },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true, editor });
  }

  const cleared = setIdle(board.id, clientId, user.id, noteId);
  return NextResponse.json({ ok: true, cleared });
}
