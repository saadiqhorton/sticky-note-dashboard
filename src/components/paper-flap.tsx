"use client";

import { FOLD_SIZE } from "@/lib/paper-flap";

type PaperFlapProps = {
  tint: string;
};

export function PaperFlap({ tint }: PaperFlapProps) {
  return (
    <span
      aria-hidden
      className="paper-fold"
      style={
        {
          width: FOLD_SIZE,
          height: FOLD_SIZE,
          ["--fold-tint"]: tint,
        } as React.CSSProperties
      }
    >
      <span className="paper-fold-crease" />
      <span className="paper-fold-arm">
        <span className="paper-fold-front" />
        <span className="paper-fold-back" />
      </span>
    </span>
  );
}
