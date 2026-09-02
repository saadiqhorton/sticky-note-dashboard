"use client";

import { useRef } from "react";
import { flapMotion } from "@/lib/paper-flap";

type PaperFlapProps = {
  peel: number;
  tint: string;
};

export function PaperFlap({ peel, tint }: PaperFlapProps) {
  const resting = peel <= 0;
  const wasResting = useRef(true);
  const justLifted = !resting && wasResting.current;
  wasResting.current = resting;

  const motion = flapMotion(peel);
  const durationMs = resting ? 200 : justLifted ? 160 : 0;
  const transition =
    durationMs > 0
      ? `transform ${durationMs}ms var(--ease-out), opacity ${durationMs}ms var(--ease-out)`
      : "none";

  return (
    <span
      aria-hidden
      className="paper-flap"
      data-rest={resting ? "true" : "false"}
      style={{ ["--flap-tint" as string]: tint }}
    >
      <span
        className="paper-flap-reveal"
        style={{
          opacity: motion.revealOpacity,
          transform: motion.revealTransform,
          transition,
        }}
      />
      <span
        className="paper-flap-leaf"
        style={{
          opacity: motion.leafOpacity,
          transform: motion.leafTransform,
          transition,
        }}
      >
        <span className="paper-flap-face" />
      </span>
    </span>
  );
}
