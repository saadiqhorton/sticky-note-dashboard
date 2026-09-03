export const FOLD_SIZE = 44;
export const LIFT_ANGLE = 0;

export type FlapGeometry = {
  size: number;
  angle: number;
  opacity: number;
  clipPath: string;
};

export function clampPeel(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function qty(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function mixWhite(hex: string, amount: number): string {
  const [r, g, b] = hexRgb(hex);
  return rgbHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

export function mixInk(hex: string, amount: number): string {
  const [r, g, b] = hexRgb(hex);
  return rgbHex(r + (44 - r) * amount, g + (36 - g) * amount, b + (22 - b) * amount);
}

/**
 * Overlay size for the hover curl. The note face is never clipped —
 * a white bite in the corner is a hole, not a fold.
 */
export function flapGeometry(
  peel: number,
  width: number,
  height: number,
): FlapGeometry {
  const lifted = clampPeel(peel) > 0;
  const size = lifted ? FOLD_SIZE : 0;
  return {
    size,
    angle: 0,
    opacity: lifted ? 1 : 0,
    clipPath: `polygon(0px 0px, ${qty(width)}px 0px, ${width}px 0px, ${width}px ${height}px, 0px ${height}px)`,
  };
}
