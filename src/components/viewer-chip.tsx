/**
 * Board-level "N viewing" indicator, rendered from presence state owned by
 * board-app.tsx (distinct clientIds with an open note, self included).
 * Kept out of board-chrome.tsx (parallel-team ownership).
 */
export function ViewerChip({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 rounded-full border border-cork/40 bg-paper px-3 py-1.5 text-xs font-medium text-ink-muted shadow-sm">
      {count === 1 ? "1 viewing" : `${count} viewing`}
    </div>
  );
}
