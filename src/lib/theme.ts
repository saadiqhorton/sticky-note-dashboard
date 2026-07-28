export const stickyColors = {
  yellow: "#FFE566",
  pink: "#FFC2D1",
  blue: "#B8D4F0",
  green: "#C5E8C0",
} as const;

export type StickyColorKey = keyof typeof stickyColors;

export const designTokens = {
  paper: "#FFF8E7",
  chrome: "#FFF1C2",
  cork: "#B8956A",
  corkDeep: "#8B6B45",
  ink: "#2C2416",
  inkMuted: "#5C4F3A",
  amber: "#E8A317",
} as const;
