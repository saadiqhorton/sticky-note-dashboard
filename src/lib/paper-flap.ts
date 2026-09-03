export const FOLD_SIZE = 20;
export const LIFT_ANGLE = 168;

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

/**
 * Top-right corner lift geometry. The live flap is driven by CSS :hover;
 * this helper keeps the clip polygon testable.
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
    angle: lifted ? LIFT_ANGLE : 0,
    opacity: lifted ? 1 : 0,
    clipPath: `polygon(0px 0px, ${qty(width - size)}px 0px, ${width}px ${size}px, ${width}px ${height}px, 0px ${height}px)`,
  };
}
