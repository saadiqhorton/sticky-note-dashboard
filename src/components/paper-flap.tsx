"use client";

import { FOLD_SIZE } from "@/lib/paper-flap";

type PaperFlapProps = {
  peel: number;
  tint: string;
};

export function PaperFlap({ peel, tint }: PaperFlapProps) {
  const lifted = peel > 0;

  return (
    <span
      aria-hidden
      className="paper-fold"
      data-lifted={lifted ? "true" : "false"}
      style={
        {
          width: FOLD_SIZE,
          height: FOLD_SIZE,
          ["--fold-tint"]: tint,
        } as React.CSSProperties
      }
    >
      <span className="paper-fold-ao" />
      <span className="paper-fold-arm">
        <span className="paper-fold-front" />
        <span className="paper-fold-edge" />
      </span>
    </span>
  );
}
