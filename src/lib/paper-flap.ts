import { clampPeel } from "@/lib/note-overlap";

export type FlapGeometry = {
  size: number;
  angle: number;
  opacity: number;
  clipPath: string;
};

function qty(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

/**
 * Top-right corner peel. Clip a triangular bite out of the note, then
 * hinge that triangle around the crease (rotate3d(1,1,0)) so the
 * underside lands on the remaining sheet — not in the hole.
 *
 * Angle stays past 90° whenever the flap is visible, so the viewer
 * sees paper back, not a sticker filling the cut.
 */
export function flapGeometry(
  peel: number,
  width: number,
  height: number,
): FlapGeometry {
  const t = clampPeel(peel);
  const size = t === 0 ? 0 : qty(18 + t * 30);
  return {
    size,
    angle: t === 0 ? 0 : qty(108 + t * 22),
    opacity: t === 0 ? 0 : 1,
    clipPath: `polygon(0px 0px, ${qty(width - size)}px 0px, ${width}px ${size}px, ${width}px ${height}px, 0px ${height}px)`,
  };
}
