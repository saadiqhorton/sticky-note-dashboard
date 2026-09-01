"use client";

import { stickyColors, type StickyColorKey } from "@/lib/theme";

export type CanvasNote = {
  id: string;
  title: string;
  preview: string;
  color: StickyColorKey;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation: number;
  updatedAt: string;
  editingBy?: string | null;
};

type StickyNoteCardProps = {
  note: CanvasNote;
  selected?: boolean;
  dragging?: boolean;
  hidden?: boolean;
  onPointerDown?: (event: React.PointerEvent, note: CanvasNote) => void;
  onOpen?: (note: CanvasNote) => void;
  onContextMenu?: (event: React.MouseEvent, note: CanvasNote) => void;
};

export function StickyNoteCard({
  note,
  selected,
  dragging,
  hidden,
  onPointerDown,
  onOpen,
  onContextMenu,
}: StickyNoteCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-note-id={note.id}
      onPointerDown={(event) => onPointerDown?.(event, note)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event, note);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.(note);
        }
      }}
      className={`absolute origin-center rounded-sm p-4 text-left transition-opacity select-none ${
        dragging ? "sticky-shadow-lifted cursor-grabbing" : "sticky-shadow cursor-grab"
      } ${selected ? "ring-2 ring-ink/40" : ""} ${hidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
        zIndex: dragging ? 9999 : note.zIndex,
        background: stickyColors[note.color],
        transform: `rotate(${dragging ? note.rotation - 4 : note.rotation}deg)`,
      }}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute right-0 top-0 h-8 w-8 overflow-hidden transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          dragging || selected ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Paper corner flap — always mounted so the drag peel transition plays; hidden at rest. */}
        <span
          className={`absolute -right-4 -top-4 h-10 w-10 transition-all duration-200 ease-out motion-reduce:transition-none ${
            dragging
              ? "rotate-[54deg] scale-105 bg-linear-to-br from-chrome to-paper shadow-lg shadow-ink/25"
              : "rotate-45 bg-paper shadow"
          }`}
        />
      </span>
      <p className="font-display text-lg leading-tight text-ink pointer-events-none">
        {note.title}
      </p>
      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-ink-muted pointer-events-none">
        {note.preview}
      </p>
      {note.editingBy ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-ink pointer-events-none">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-700" />
          {note.editingBy}
        </p>
      ) : null}
    </div>
  );
}
