export type NoteRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Slight curl while dragging even when the note is over empty paper. */
export const DRAG_PEEL_FLOOR = 0.35;

export function noteOverlapRatio(a: NoteRect, b: NoteRect): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  const intersection = (right - left) * (bottom - top);
  const minArea = Math.min(a.width * a.height, b.width * b.height);
  if (minArea <= 0) return 0;
  return Math.min(1, intersection / minArea);
}

/**
 * Peel 0–1 for each note while `draggingId` is in motion.
 * The dragged note peels by its max overlap (floored so empty-space drag
 * still curls). Neighbors peel by how much the dragged note covers them.
 */
export function peelByNoteId(
  notes: NoteRect[],
  draggingId: string | null,
): Map<string, number> {
  const peels = new Map<string, number>();
  if (!draggingId) return peels;
  const dragged = notes.find((note) => note.id === draggingId);
  if (!dragged) return peels;

  let dragOverlap = 0;
  for (const other of notes) {
    if (other.id === dragged.id) continue;
    const ratio = noteOverlapRatio(dragged, other);
    if (ratio <= 0) continue;
    peels.set(other.id, ratio);
    if (ratio > dragOverlap) dragOverlap = ratio;
  }
  peels.set(draggingId, Math.min(1, Math.max(DRAG_PEEL_FLOOR, dragOverlap)));
  return peels;
}

export function flapTransform(peel: number): { rotateDeg: number; scale: number } {
  const amount = Math.min(1, Math.max(0, peel));
  return {
    rotateDeg: 45 + amount * 27,
    scale: 1 + amount * 0.16,
  };
}
