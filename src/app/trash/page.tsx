import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { restoreNote, purgeNote } from "./actions";

export default async function TrashPage() {
  const { user } = await requireUser();
  const company = await prisma.board.findFirst({ where: { type: "company" } });
  const privateBoard = await prisma.board.findFirst({
    where: { type: "private", ownerUserId: user.id },
  });

  const boardIds = [company?.id, privateBoard?.id].filter(Boolean) as string[];

  const notes = await prisma.note.findMany({
    where: {
      boardId: { in: boardIds },
      deletedAt: { not: null },
      ...(user.role === "admin"
        ? {}
        : {
            OR: [
              { board: { type: "company" } },
              { board: { type: "private", ownerUserId: user.id } },
            ],
          }),
    },
    include: { board: true },
    orderBy: { deletedAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-paper px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink">Trash</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Soft-deleted notes. Anyone can restore; admins can purge forever.
          </p>
        </div>
        <Link href="/?board=team" className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-sticky-yellow">
          ← Board
        </Link>
      </div>

      <ul className="space-y-3">
        {notes.map((note) => (
          <li
            key={note.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-cork/35 bg-white px-5 py-4"
          >
            <div>
              <p className="font-display text-lg text-ink">{note.title}</p>
              <p className="text-xs text-ink-muted">
                {note.board.type === "company" ? "team" : "my board"} · deleted{" "}
                {note.deletedAt?.toLocaleString() ?? ""}
              </p>
            </div>
            <div className="flex gap-2">
              <form action={restoreNote.bind(null, note.id)}>
                <button className="rounded-lg border border-cork/40 bg-chrome px-3 py-2 text-sm font-semibold">
                  Restore
                </button>
              </form>
              {user.role === "admin" ? (
                <form action={purgeNote.bind(null, note.id)}>
                  <button className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-paper">
                    Purge
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
        {notes.length === 0 ? (
          <li className="text-sm text-ink-muted">Trash is empty.</li>
        ) : null}
      </ul>
    </main>
  );
}
