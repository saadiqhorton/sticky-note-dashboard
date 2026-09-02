/** Slight curl on the dragged note after it has actually moved. */
export const DRAG_PEEL_FLOOR = 0.35;

export function clampPeel(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Peel 0–1 while `draggingId` is in motion.
 * Only the dragged Sticky Note peels, at a constant floor. Overlap /
 * contact with other notes does not trigger a flap.
 */
export function peelByNoteId(
  notes: { id: string }[],
  draggingId: string | null,
): Map<string, number> {
  const peels = new Map<string, number>();
  if (!draggingId) return peels;
  if (!notes.some((note) => note.id === draggingId)) return peels;
  peels.set(draggingId, DRAG_PEEL_FLOOR);
  return peels;
}
