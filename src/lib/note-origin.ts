export type NoteOriginRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function getNoteOriginRect(noteId: string): NoteOriginRect | null {
  const el = document.querySelector<HTMLElement>(`[data-note-id="${noteId}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function getCenteredEditorRect(): NoteOriginRect {
  const maxWidth = Math.min(720, window.innerWidth - 48);
  const maxHeight = Math.min(760, window.innerHeight - 48);
  return {
    width: maxWidth,
    height: maxHeight,
    left: (window.innerWidth - maxWidth) / 2,
    top: (window.innerHeight - maxHeight) / 2,
  };
}
