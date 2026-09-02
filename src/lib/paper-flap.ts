import { clampPeel } from "@/lib/note-overlap";

export type FlapMotion = {
  leafOpacity: number;
  leafTransform: string;
  revealOpacity: number;
  revealTransform: string;
};

function qty(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

/**
 * GPU poses for a top-right paper curl.
 * Scale stays ≥ 0.94 so the curl never appears from nothing.
 * The leaf uses rotateX/Y/Z so the corner actually lifts off the note.
 */
export function flapMotion(peel: number): FlapMotion {
  const t = clampPeel(peel);
  const rotateX = qty(8 + t * 26);
  const rotateY = qty(12 + t * 22);
  const rotateZ = qty(-10 - t * 8);
  const scale = qty(0.94 + t * 0.08, 3);
  return {
    leafOpacity: t === 0 ? 0 : qty(0.92 + t * 0.08, 3),
    leafTransform: `translate3d(${qty(t * 8)}px, ${qty(t * -12)}px, ${qty(t * 20)}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg) scale(${scale})`,
    revealOpacity: qty(t * 0.88, 3),
    revealTransform: `scale(${qty(0.78 + t * 0.22, 3)})`,
  };
}
