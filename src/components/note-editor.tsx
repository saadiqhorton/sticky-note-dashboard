"use client";

import { useEffect, useRef, useState } from "react";
import { stickyColors, type StickyColorKey } from "@/lib/theme";
import type { CanvasNote } from "@/components/sticky-note-card";
import {
  getCenteredEditorRect,
  getNoteOriginRect,
  type NoteOriginRect,
} from "@/lib/note-origin";

type NoteEditorProps = {
  note: CanvasNote;
  origin: NoteOriginRect | null;
  warning?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onClose: () => void;
  onSave: (input: {
    id: string;
    title: string;
    preview: string;
    color: StickyColorKey;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

/** GAP-016: shown when a save was rejected with 409 (peer wrote first). */
type ConflictNoticeProps = {
  conflict?: string | null;
  onDismissConflict?: () => void;
};

type Phase = "enter-from" | "enter-to" | "open" | "exit";
type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const DURATION_MS = 420;
const AUTOSAVE_MS = 700;

export function NoteEditor({
  note,
  origin,
  warning,
  conflict,
  onDismissConflict,
  onDirtyChange,
  onClose,
  onSave,
  onDelete,
}: NoteEditorProps & ConflictNoticeProps) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.preview);
  const [color, setColor] = useState<StickyColorKey>(note.color);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [deleting, setDeleting] = useState(false);
  const [phase, setPhase] = useState<Phase>("enter-from");
  const [frame, setFrame] = useState<NoteOriginRect>(
    () => origin ?? getCenteredEditorRect(),
  );
  const [backdropReady, setBackdropReady] = useState(false);
  const closingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const draftRef = useRef({ title: note.title, body: note.preview, color: note.color });
  const lastSavedRef = useRef({
    title: note.title,
    body: note.preview,
    color: note.color,
  });
  const saveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  // Reset local draft only when opening a different note
  useEffect(() => {
    setTitle(note.title);
    setBody(note.preview);
    setColor(note.color);
    setSaveStatus("idle");
    onDirtyChangeRef.current?.(false);
    draftRef.current = {
      title: note.title,
      body: note.preview,
      color: note.color,
    };
    lastSavedRef.current = {
      title: note.title,
      body: note.preview,
      color: note.color,
    };
  }, [note.id]);

  function markDirty() {
    setSaveStatus("dirty");
    onDirtyChangeRef.current?.(true);
  }

  useEffect(() => {
    closingRef.current = false;
    const start = origin ?? {
      left: window.innerWidth / 2 - 40,
      top: window.innerHeight / 2 - 40,
      width: 80,
      height: 80,
    };
    setFrame(start);
    setPhase("enter-from");
    setBackdropReady(false);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      setBackdropReady(true);
      raf2 = requestAnimationFrame(() => {
        setFrame(getCenteredEditorRect());
        setPhase("enter-to");
      });
    });

    const openTimer = window.setTimeout(() => setPhase("open"), DURATION_MS);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(openTimer);
    };
  }, [note.id, origin]);

  function isDirty(
    draft: { title: string; body: string; color: StickyColorKey },
    saved: { title: string; body: string; color: StickyColorKey },
  ) {
    return (
      draft.title !== saved.title ||
      draft.body !== saved.body ||
      draft.color !== saved.color
    );
  }

  async function persist() {
    const draft = draftRef.current;
    if (!isDirty(draft, lastSavedRef.current)) {
      setSaveStatus((s) => (s === "dirty" ? "saved" : s));
      return;
    }
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }

    savingRef.current = true;
    setSaveStatus("saving");
    try {
      await onSaveRef.current({
        id: note.id,
        title: draft.title,
        preview: draft.body,
        color: draft.color,
      });
      lastSavedRef.current = { ...draft };
      setSaveStatus("saved");
      onDirtyChangeRef.current?.(false);
    } catch {
      setSaveStatus("error");
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void persist();
      }
    }
  }

  function scheduleSave() {
    markDirty();
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persist();
    }, AUTOSAVE_MS);
  }

  function updateTitle(value: string) {
    setTitle(value);
    draftRef.current = { ...draftRef.current, title: value };
    scheduleSave();
  }

  function updateBody(value: string) {
    setBody(value);
    draftRef.current = { ...draftRef.current, body: value };
    scheduleSave();
  }

  function updateColor(value: StickyColorKey) {
    setColor(value);
    draftRef.current = { ...draftRef.current, color: value };
    scheduleSave();
  }

  async function flushAndClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await persist();

    setPhase("exit");
    setBackdropReady(false);
    const target =
      getNoteOriginRect(note.id) ??
      origin ?? {
        left: window.innerWidth / 2 - 40,
        top: window.innerHeight / 2 - 40,
        width: 80,
        height: 80,
      };
    setFrame(target);
    window.setTimeout(() => {
      onClose();
    }, DURATION_MS);
  }

  // Flush pending edits if the editor unmounts unexpectedly
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const contentVisible = phase === "open" || phase === "enter-to";
  const statusLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "dirty"
          ? "Editing…"
          : saveStatus === "error"
            ? "Couldn’t save"
            : "";

  return (
    <div className="fixed inset-0 z-[11000]" aria-modal="true" role="dialog">
      <button
        type="button"
        aria-label="Close note"
        className={`absolute inset-0 border-0 bg-[#E8D9B0]/55 transition-opacity duration-[420ms] ease-out ${
          backdropReady && phase !== "exit" ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => void flushAndClose()}
      />

      <div
        ref={panelRef}
        className="note-zoom-panel absolute overflow-hidden rounded-sm sticky-shadow-lifted"
        style={{
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
          background: stickyColors[color],
          transitionProperty: "left, top, width, height, border-radius",
          transitionDuration: `${DURATION_MS}ms`,
          transitionTimingFunction: EASING,
          padding:
            phase === "enter-from" || phase === "exit" ? "16px" : "36px",
        }}
      >
        <div
          className={`flex h-full flex-col transition-opacity duration-200 ${
            contentVisible ? "opacity-100" : "opacity-0"
          }`}
          style={{
            transitionDelay: phase === "enter-to" ? "120ms" : "0ms",
          }}
        >
          <div className="mb-4 flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={() => void flushAndClose()}
              className="rounded-lg bg-paper px-3 py-2 text-sm font-semibold text-ink"
            >
              ← Back
            </button>
            <p
              className={`ml-2 text-sm font-medium ${
                saveStatus === "error" ? "text-red-800" : "text-ink-muted"
              }`}
              aria-live="polite"
            >
              {statusLabel}
            </p>
            <div className="ml-auto flex items-center gap-2">
              {(Object.keys(stickyColors) as StickyColorKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  onClick={() => updateColor(key)}
                  className={`h-[22px] w-[22px] rounded-full border ${
                    color === key ? "border-2 border-ink" : "border-ink/25"
                  }`}
                  style={{ background: stickyColors[key] }}
                />
              ))}
            </div>
          </div>

          {warning ? (
            <p className="mb-4 shrink-0 rounded-lg border border-amber bg-paper px-3 py-2.5 text-sm font-medium text-ink-muted">
              ⚠ {warning}
            </p>
          ) : null}
          {conflict ? (
            <div className="mb-4 flex shrink-0 items-center gap-2 rounded-lg border border-red-800/40 bg-paper px-3 py-2.5 text-sm font-medium text-red-800">
              <span className="flex-1">⚠ {conflict}</span>
              <button
                type="button"
                aria-label="Dismiss conflict notice"
                onClick={onDismissConflict}
                className="rounded border border-red-800/30 px-1.5 text-xs font-semibold"
              >
                ×
              </button>
            </div>
          ) : null}

          <input
            value={title}
            onChange={(e) => updateTitle(e.target.value)}
            className="w-full shrink-0 bg-transparent font-display text-4xl text-ink outline-none"
            placeholder="Note title"
          />

          <textarea
            value={body}
            onChange={(e) => updateBody(e.target.value)}
            className="mt-4 min-h-0 w-full flex-1 resize-none bg-transparent text-base leading-relaxed text-ink outline-none"
            placeholder="Things the team should remember…"
          />

          <div className="mt-6 flex shrink-0 flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={deleting || phase === "exit"}
              onClick={async () => {
                setDeleting(true);
                if (saveTimerRef.current) {
                  window.clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                }
                await onDelete(note.id);
                setDeleting(false);
                onClose();
              }}
              className="rounded-lg border border-cork/40 bg-paper px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
            >
              {deleting ? "Trashing…" : "Move to Trash"}
            </button>
          </div>
        </div>

        {(phase === "enter-from" || phase === "exit") && (
          <div className="pointer-events-none absolute inset-0 p-4">
            <p className="font-display text-lg leading-tight text-ink">
              {title || note.title}
            </p>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-ink-muted">
              {body || note.preview}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
