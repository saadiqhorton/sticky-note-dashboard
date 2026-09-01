import { clampPeel } from "@/lib/note-overlap";

export function flapTransform(peel: number): { rotateDeg: number; scale: number } {
  const amount = clampPeel(peel);
  return {
    rotateDeg: 45 + amount * 27,
    scale: 1 + amount * 0.16,
  };
}
