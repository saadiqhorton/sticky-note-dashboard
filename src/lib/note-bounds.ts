/** Default sticky size from Prisma schema. */
export const DEFAULT_NOTE_WIDTH = 220;
export const DEFAULT_NOTE_HEIGHT = 200;

/** Keep notes slightly inset from canvas edges. */
export const NOTE_BOUNDS_PADDING = 12;

/** Soft server-side ceiling until pan/zoom adds a real canvas size. */
export const MAX_CANVAS_WIDTH = 5000;
export const MAX_CANVAS_HEIGHT = 5000;

export type NoteSize = {
  width: number;
  height: number;
};

export type CanvasSize = {
  width: number;
  height: number;
};

export function clampNotePosition(
  x: number,
  y: number,
  note: NoteSize,
  canvas: CanvasSize,
  padding = NOTE_BOUNDS_PADDING,
): { x: number; y: number } {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { x: Math.max(0, x), y: Math.max(0, y) };
  }

  const minX = padding;
  const minY = padding;
  const maxX = Math.max(minX, canvas.width - note.width - padding);
  const maxY = Math.max(minY, canvas.height - note.height - padding);

  return {
    x: Math.min(Math.max(minX, x), maxX),
    y: Math.min(Math.max(minY, y), maxY),
  };
}

/** Server-side guard when viewport size is unknown. */
export function clampNotePositionForStorage(
  x: number,
  y: number,
  note: NoteSize,
): { x: number; y: number } {
  return clampNotePosition(x, y, note, {
    width: MAX_CANVAS_WIDTH,
    height: MAX_CANVAS_HEIGHT,
  });
}
