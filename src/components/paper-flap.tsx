"use client";

import { useId } from "react";
import { FOLD_SIZE, mixInk, mixWhite } from "@/lib/paper-flap";

type PaperFlapProps = {
  tint: string;
};

export function PaperFlap({ tint }: PaperFlapProps) {
  const uid = useId().replace(/:/g, "");
  const paper = `paper-${uid}`;
  const shade = `shade-${uid}`;
  const crease = `crease-${uid}`;
  const blur = `blur-${uid}`;
  const highlight = mixWhite(tint, 0.42);
  const mid = mixWhite(tint, 0.08);
  const deep = mixInk(tint, 0.22);

  return (
    <svg
      aria-hidden
      className="paper-fold"
      width={FOLD_SIZE}
      height={FOLD_SIZE}
      viewBox="0 0 48 48"
      fill="none"
    >
      <defs>
        <linearGradient
          id={shade}
          x1="10"
          y1="8"
          x2="42"
          y2="42"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2c2416" stopOpacity="0" />
          <stop offset="0.4" stopColor="#2c2416" stopOpacity="0.3" />
          <stop offset="1" stopColor="#2c2416" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={paper}
          x1="48"
          y1="0"
          x2="6"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={highlight} />
          <stop offset="0.24" stopColor={mid} />
          <stop offset="0.58" stopColor={tint} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
        <linearGradient
          id={crease}
          x1="0"
          y1="0"
          x2="48"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.35" stopColor="#fffef8" stopOpacity="0" />
          <stop offset="0.48" stopColor="#fffef8" stopOpacity="0.55" />
          <stop offset="0.52" stopColor="#2c2416" stopOpacity="0.28" />
          <stop offset="0.7" stopColor="#2c2416" stopOpacity="0" />
        </linearGradient>
        <filter
          id={blur}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
      </defs>
      <path
        d="M8 0C20 14 32 28 48 46L48 48L0 48L0 0Z"
        fill={`url(#${shade})`}
        filter={`url(#${blur})`}
      />
      <path
        className="paper-fold-curl"
        d="M1.2 1.4C17 0.2 36.5 1.8 46.8 11.2C47.8 22 47.6 35 46.5 46.6C33.5 39 17.5 21.5 1.2 1.4Z"
        fill={`url(#${paper})`}
      />
      <path
        d="M5 3C18 15 32 31 45 45"
        stroke={`url(#${crease})`}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
