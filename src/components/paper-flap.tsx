"use client";

import { useRef } from "react";
import { flapGeometry } from "@/lib/paper-flap";

type PaperFlapProps = {
  peel: number;
  width: number;
  height: number;
};

export function PaperFlap({ peel, width, height }: PaperFlapProps) {
  const resting = peel <= 0;
  const wasResting = useRef(true);
  const justLifted = !resting && wasResting.current;
  wasResting.current = resting;

  const geo = flapGeometry(peel, width, height);
  if (geo.size <= 0) return null;

  const durationMs = resting ? 200 : justLifted ? 160 : 0;
  const transition =
    durationMs > 0 ? `opacity ${durationMs}ms var(--ease-out)` : "none";

  return (
    <span
      aria-hidden
      className="paper-fold"
      style={{
        width: geo.size,
        height: geo.size,
        opacity: geo.opacity,
        transition,
      }}
    >
      <span className="paper-fold-shade" />
      <span className="paper-fold-back" />
    </span>
  );
}
