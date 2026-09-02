"use client";

import { flapGeometry } from "@/lib/paper-flap";

type PaperFlapProps = {
  peel: number;
  tint: string;
  width: number;
  height: number;
};

export function PaperFlap({ peel, tint, width, height }: PaperFlapProps) {
  const resting = peel <= 0;
  const geo = flapGeometry(peel, width, height);
  if (geo.size <= 0) return null;

  return (
    <span
      aria-hidden
      className="paper-fold"
      data-rest={resting ? "true" : "false"}
      style={
        {
          width: geo.size,
          height: geo.size,
          ["--fold-tint"]: tint,
        } as React.CSSProperties
      }
    >
      <span className="paper-fold-ao" />
      <span className="paper-fold-edge" />
      <span
        className="paper-fold-arm"
        style={{ transform: `rotate3d(1, 1, 0, ${geo.angle}deg)` }}
      >
        <span className="paper-fold-front" />
        <span className="paper-fold-back" />
      </span>
    </span>
  );
}
