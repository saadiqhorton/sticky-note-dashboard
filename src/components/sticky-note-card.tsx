"use client";

import { PaperFlap } from "@/components/paper-flap";
import { clampPeel } from "@/lib/note-overlap";
import { flapGeometry } from "@/lib/paper-flap";
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
  /** 0–1 paper-flap peel on the dragged Sticky Note. */
  peel?: number;
  hidden?: boolean;
  onPointerDown?: (event: React.PointerEvent, note: CanvasNote) => void;
  onOpen?: (note: CanvasNote) => void;
  onContextMenu?: (event: React.MouseEvent, note: CanvasNote) => void;
};

export function StickyNoteCard({
  note,
  selected,
  dragging,
  peel: peelAmount = 0,
  hidden,
  onPointerDown,
  onOpen,
  onContextMenu,
}: StickyNoteCardProps) {
  const peel = clampPeel(peelAmount);
  const geo = flapGeometry(peel, note.width, note.height);
  const tint = stickyColors[note.color];

  return (
    <div
      role="button"
      tabIndex={0}
      data-note-id={note.id}
      data-peel={peel.toFixed(2)}
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
      className={`absolute origin-center overflow-visible rounded-sm text-left transition-opacity select-none ${
        dragging ? "sticky-shadow-lifted cursor-grabbing" : "sticky-shadow cursor-grab"
      } ${selected ? "ring-2 ring-ink/40" : ""} ${hidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
        zIndex: dragging ? 9999 : note.zIndex,
        transform: `rotate(${note.rotation}deg)`,
      }}
    >
      <div
        className="sticky-note-face absolute inset-0 rounded-sm p-4"
        style={{
          background: tint,
          clipPath: geo.clipPath,
        }}
      >
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
      <PaperFlap peel={peel} tint={tint} />
    </div>
  );
}
