import { clampPeel } from "@/lib/note-overlap";

export type FlapGeometry = {
  size: number;
  opacity: number;
  clipPath: string;
};

function qty(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

/**
 * Top-right corner fold.
 *
 * Bite the corner off the note (clipPath). The folded paper is the
 * reflection of that triangle across the crease, so it sits on the note
 * body — not in the hole.
 */
export function flapGeometry(
  peel: number,
  width: number,
  height: number,
): FlapGeometry {
  const t = clampPeel(peel);
  const size = t === 0 ? 0 : qty(18 + t * 18);
  return {
    size,
    opacity: t === 0 ? 0 : 1,
    clipPath: `polygon(0px 0px, ${qty(width - size)}px 0px, ${width}px ${size}px, ${width}px ${height}px, 0px ${height}px)`,
  };
}
