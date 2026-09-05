/** Side length of the folded corner, in px. */
export const FOLD_SIZE = 40;

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Toward white — the lit tip of the fold. */
export function mixWhite(hex: string, amount: number): string {
  const [r, g, b] = hexRgb(hex);
  return rgbHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

/** Toward ink — the shaded paper near the crease. */
export function mixInk(hex: string, amount: number): string {
  const [r, g, b] = hexRgb(hex);
  return rgbHex(r + (44 - r) * amount, g + (36 - g) * amount, b + (22 - b) * amount);
}
