import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getCompanyBoard,
  getOrCreatePrivateBoard,
  serializeNote,
} from "@/lib/notes";
import { BoardApp } from "@/components/board-app";
import { parseBoardParam } from "@/lib/board-param";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string; view?: string }>;
}) {
  const { user } = await requireUser();
  const params = await searchParams;

  // Legacy URL → Team
  if (params.board === "company") {
    const next = new URLSearchParams();
    next.set("board", "team");
    if (params.view) next.set("view", params.view);
    redirect(`/?${next.toString()}`);
  }

  const boardParam = parseBoardParam(params.board);
  const boardType = boardParam === "private" ? "private" : "company";

  const board =
    boardType === "private"
      ? await getOrCreatePrivateBoard(user.id)
      : await getCompanyBoard();

  if (boardType === "private" && board.ownerUserId !== user.id) {
    redirect("/?board=team");
  }

  const notes = await prisma.note.findMany({
    where: { boardId: board.id, deletedAt: null },
    orderBy: { zIndex: "asc" },
  });

  return (
    <BoardApp
      isAdmin={user.role === "admin"}
      currentUserId={user.id}
      currentUserName={user.name || user.email || "You"}
      initialNotes={notes.map(serializeNote)}
    />
  );
}
