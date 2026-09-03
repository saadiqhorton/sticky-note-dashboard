"use client";

import { useState } from "react";
import { PaperFlap } from "@/components/paper-flap";
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
  const tint = stickyColors[note.color];
  const [hovered, setHovered] = useState(false);
  const lifted = hovered && !dragging;

  return (
    <div
      role="button"
      tabIndex={0}
      data-note-id={note.id}
      data-dragging={dragging ? "true" : "false"}
      data-lifted={lifted ? "true" : "false"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setHovered(false);
      }}
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
      className={`absolute origin-center overflow-visible text-left transition-opacity select-none ${
        dragging
          ? "sticky-note-shadow-lifted cursor-grabbing"
          : "sticky-note-shadow cursor-grab"
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
        className="sticky-note-face absolute inset-0 p-4"
        style={{ background: tint }}
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
      <PaperFlap tint={tint} />
    </div>
  );
}
