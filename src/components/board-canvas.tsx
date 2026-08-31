"use client";

import { useEffect, useRef, useState } from "react";
import { StickyNoteCard, type CanvasNote } from "@/components/sticky-note-card";
import {
  clampNotePosition,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
} from "@/lib/note-bounds";

type BoardCanvasProps = {
  notes: CanvasNote[];
  openNoteId?: string | null;
  onCreateAt: (x: number, y: number) => void;
  onMoveNote: (id: string, x: number, y: number, zIndex: number) => void;
  onOpenNote: (note: CanvasNote) => void;
  onDeleteNote: (id: string) => void;
};

type EmptyMenu = {
  kind: "empty";
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
};

type NoteMenu = {
  kind: "note";
  x: number;
  y: number;
  note: CanvasNote;
};

type MenuState = EmptyMenu | NoteMenu | null;

const DRAG_THRESHOLD = 4;

export function BoardCanvas({
  notes,
  openNoteId,
  onCreateAt,
  onMoveNote,
  onOpenNote,
  onDeleteNote,
}: BoardCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState(notes);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
    maxZ: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  // Mirror parent notes when not dragging — don't re-clamp here (that caused jank)
  useEffect(() => {
    if (draggingId) return;
    setLocalNotes(notes);
  }, [notes, draggingId]);

  function getCanvasSize() {
    const el = surfaceRef.current;
    if (!el) {
      return {
        width: typeof window !== "undefined" ? window.innerWidth : 1200,
        height:
          typeof window !== "undefined" ? window.innerHeight - 72 : 800,
      };
    }
    return { width: el.clientWidth, height: el.clientHeight };
  }

  function clampForNote(
    note: Pick<CanvasNote, "width" | "height">,
    x: number,
    y: number,
  ) {
    return clampNotePosition(x, y, note, getCanvasSize());
  }

  function canvasPoint(event: { clientX: number; clientY: number }) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onEmptyContextMenu(event: React.MouseEvent) {
    event.preventDefault();
    const point = canvasPoint(event);
    setMenu({
      kind: "empty",
      x: point.x,
      y: point.y,
      canvasX: point.x,
      canvasY: point.y,
    });
  }

  function onNoteContextMenu(event: React.MouseEvent, note: CanvasNote) {
    const point = canvasPoint(event);
    setMenu({
      kind: "note",
      x: point.x,
      y: point.y,
      note,
    });
  }

  function startDrag(event: React.PointerEvent, note: CanvasNote) {
    if (event.button !== 0) return;
    // Do not preventDefault here — it kills native double-click.
    event.stopPropagation();
    setMenu(null);
    const maxZ = Math.max(0, ...localNotes.map((n) => n.zIndex)) + 1;
    dragRef.current = {
      id: note.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: note.x,
      originY: note.y,
      offsetX: event.clientX - note.x,
      offsetY: event.clientY - note.y,
      lastX: note.x,
      lastY: note.y,
      maxZ,
      moved: false,
      pointerId: event.pointerId,
    };
    setDraggingId(note.id);
    setLocalNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, zIndex: maxZ } : n)),
    );
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      event.preventDefault();
      try {
        surfaceRef.current?.setPointerCapture(drag.pointerId);
      } catch {
        /* ignore if already released */
      }
    }
    const rawX = event.clientX - drag.offsetX;
    const rawY = event.clientY - drag.offsetY;
    const note = localNotes.find((n) => n.id === drag.id);
    const { x, y } = note
      ? clampForNote(note, rawX, rawY)
      : { x: rawX, y: rawY };
    drag.lastX = x;
    drag.lastY = y;
    setLocalNotes((prev) =>
      prev.map((n) =>
        n.id === drag.id ? { ...n, x, y, zIndex: drag.maxZ } : n,
      ),
    );
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    const note = localNotes.find((n) => n.id === drag.id);
    dragRef.current = null;
    setDraggingId(null);

    if (drag.moved) {
      onMoveNote(drag.id, drag.lastX, drag.lastY, drag.maxZ);
      lastTapRef.current = null;
      return;
    }

    if (note) {
      const now = Date.now();
      const prev = lastTapRef.current;
      if (prev && prev.id === note.id && now - prev.time < 400) {
        lastTapRef.current = null;
        onOpenNote(note);
      } else {
        lastTapRef.current = { id: note.id, time: now };
      }
    }
  }

  function createNoteAt(x: number, y: number) {
    const { x: cx, y: cy } = clampForNote(
      { width: DEFAULT_NOTE_WIDTH, height: DEFAULT_NOTE_HEIGHT },
      x,
      y,
    );
    onCreateAt(cx, cy);
  }

  const menuItemClass =
    "w-full rounded-md px-3 py-2.5 text-left text-sm text-ink transition hover:bg-chrome enabled:hover:bg-chrome disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div
      ref={surfaceRef}
      className="relative min-h-[calc(100vh-4.5rem)] overflow-hidden bg-paper"
      onContextMenu={onEmptyContextMenu}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={() => setMenu(null)}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #E8A317 0.8px, transparent 1px), radial-gradient(circle at 80% 60%, #8B6B45 0.7px, transparent 1px)",
          backgroundSize: "48px 48px, 36px 36px",
        }}
      />

      {localNotes.map((note) => (
        <StickyNoteCard
          key={note.id}
          note={note}
          dragging={draggingId === note.id}
          hidden={openNoteId === note.id}
          onPointerDown={startDrag}
          onOpen={onOpenNote}
          onContextMenu={onNoteContextMenu}
        />
      ))}

      <p className="pointer-events-none absolute bottom-8 left-6 text-sm font-medium text-ink-muted">
        Drag to move · double-click to open · right-click note to delete
      </p>

      <button
        type="button"
        onClick={() => createNoteAt(160, 160)}
        className="absolute bottom-8 right-8 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-sticky-yellow sticky-shadow"
      >
        + New note
      </button>

      {menu ? (
        <div
          className="absolute z-[10000] w-56 rounded-[10px] border border-cork/35 bg-white p-2 sticky-shadow"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.kind === "empty" ? (
            <>
              <p className="px-3 pb-1 text-[11px] font-medium text-ink-muted">
                Canvas
              </p>
              <button
                type="button"
                className={`${menuItemClass} font-semibold`}
                onClick={() => {
                  createNoteAt(menu.canvasX, menu.canvasY);
                  setMenu(null);
                }}
              >
                New sticky note
              </button>
            </>
          ) : (
            <>
              <p className="px-3 pb-1 text-[11px] font-medium text-ink-muted">
                Sticky note
              </p>
              <button
                type="button"
                className={`${menuItemClass} font-semibold`}
                onClick={() => {
                  onOpenNote(menu.note);
                  setMenu(null);
                }}
              >
                Open
              </button>
              <button
                type="button"
                className={`${menuItemClass} text-red-800 hover:bg-red-50`}
                onClick={() => {
                  onDeleteNote(menu.note.id);
                  setMenu(null);
                }}
              >
                Move to Trash
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
