"use client";

import { flapGeometry } from "@/lib/paper-flap";

type PaperFlapProps = {
  peel: number;
  width: number;
  height: number;
};

export function PaperFlap({ peel, width, height }: PaperFlapProps) {
  const resting = peel <= 0;
  const geo = flapGeometry(peel, width, height);
  if (geo.size <= 0) return null;

  return (
    <span
      aria-hidden
      className="paper-fold"
      data-rest={resting ? "true" : "false"}
      style={{ width: geo.size, height: geo.size }}
    >
      <span className="paper-fold-edge" />
      <span className="paper-fold-ear" />
    </span>
  );
}
