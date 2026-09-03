"use client";

import { useId } from "react";
import { FOLD_SIZE, mixInk, mixWhite } from "@/lib/paper-flap";

type PaperFlapProps = {
  tint: string;
};

export function PaperFlap({ tint }: PaperFlapProps) {
  const uid = useId().replace(/:/g, "");
  const under = `flap-under-${uid}`;
  const soften = `flap-blur-${uid}`;

  return (
    <svg
      aria-hidden
      className="paper-fold"
      width={FOLD_SIZE}
      height={FOLD_SIZE}
      viewBox="0 0 40 40"
      fill="none"
    >
      <defs>
        <linearGradient
          id={under}
          x1="38"
          y1="2"
          x2="2"
          y2="38"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={mixWhite(tint, 0.8)} />
          <stop offset="0.5" stopColor={mixWhite(tint, 0.1)} />
          <stop offset="1" stopColor={mixInk(tint, 0.28)} />
        </linearGradient>
        <filter id={soften} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      <path
        d="M0 2 C 16 16 28 28 38 40 L0 40 Z"
        fill="#2c2416"
        opacity="0.32"
        filter={`url(#${soften})`}
      />
      <path
        className="paper-fold-curl"
        d="M0 0 L40 40 C 22 37 8 28 0 8 Z"
        fill={`url(#${under})`}
      />
      <path d="M0 0 L40 40" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="0.9" />
    </svg>
  );
}
