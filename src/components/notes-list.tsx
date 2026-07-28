"use client";

import type { CanvasNote } from "@/components/sticky-note-card";
import { stickyColors } from "@/lib/theme";

type NotesListProps = {
  notes: CanvasNote[];
  query: string;
  onOpenNote: (note: CanvasNote) => void;
};

export function NotesList({ notes, query, onOpenNote }: NotesListProps) {
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? notes.filter(
        (note) =>
          note.title.toLowerCase().includes(normalized) ||
          note.preview.toLowerCase().includes(normalized),
      )
    : notes;

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <p className="mb-4 text-sm font-medium text-ink-muted">
        {normalized
          ? `${filtered.length} notes match “${query.trim()}”`
          : `${filtered.length} notes`}
      </p>

      <ul className="space-y-3">
        {filtered.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              data-note-id={note.id}
              onClick={() => onOpenNote(note)}
              className="flex w-full items-center gap-5 rounded-xl border border-cork/35 bg-white px-5 py-5 text-left sticky-shadow"
            >
              <span
                className="h-12 w-12 shrink-0 rounded-lg"
                style={{ background: stickyColors[note.color] }}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl text-ink">
                  {note.title}
                </span>
                <span className="mt-1 block truncate text-sm text-ink-muted">
                  {note.preview || "Empty note"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-ink-muted">
        Tip: keyword search matches titles and note body text.
      </p>
    </div>
  );
}
