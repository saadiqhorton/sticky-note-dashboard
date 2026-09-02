"use client";

import { useEffect, useRef, useState } from "react";
import { flapGeometry, type FlapGeometry } from "@/lib/paper-flap";

type PaperFlapProps = {
  peel: number;
  tint: string;
  width: number;
  height: number;
};

export function PaperFlap({ peel, tint, width, height }: PaperFlapProps) {
  const geo = flapGeometry(peel, width, height);
  const live = useRef<FlapGeometry>(geo);
  if (geo.size > 0) live.current = geo;

  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (geo.size > 0) {
      setClosing(false);
      return;
    }
    if (live.current.size <= 0) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setClosing(false);
      return;
    }
    setClosing(true);
    const id = window.setTimeout(() => setClosing(false), 200);
    return () => window.clearTimeout(id);
  }, [geo.size]);

  const shown =
    geo.size > 0 ? geo : closing ? { ...live.current, angle: 0 } : null;
  if (!shown || shown.size <= 0) return null;

  const settling = peel <= 0 || closing;

  return (
    <span
      aria-hidden
      className="paper-fold"
      data-rest={settling ? "true" : "false"}
      style={
        {
          width: shown.size,
          height: shown.size,
          ["--fold-tint"]: tint,
        } as React.CSSProperties
      }
    >
      <span className="paper-fold-ao" />
      <span className="paper-fold-edge" />
      <span
        className="paper-fold-arm"
        style={{ transform: `rotate3d(1, 1, 0, ${shown.angle}deg)` }}
      >
        <span className="paper-fold-front" />
        <span className="paper-fold-back" />
      </span>
    </span>
  );
}
