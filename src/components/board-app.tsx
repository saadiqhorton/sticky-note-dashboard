"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BoardChrome } from "@/components/board-chrome";
import { BoardCanvas } from "@/components/board-canvas";
import { NotesList } from "@/components/notes-list";
import { NoteEditor } from "@/components/note-editor";
import { ViewerChip } from "@/components/viewer-chip";
import type { CanvasNote } from "@/components/sticky-note-card";
import type { StickyColorKey } from "@/lib/theme";
import { getNoteOriginRect, type NoteOriginRect } from "@/lib/note-origin";
import type { PresenceEditor } from "@/lib/realtime-types";

type BoardAppProps = {
  isAdmin: boolean;
  currentUserId: string;
  currentUserName: string;
  initialBoard: "team" | "private";
  initialNotes: CanvasNote[];
};

type OpenState = {
  note: CanvasNote;
  origin: NoteOriginRect | null;
  /** updatedAt when the editor opened / last locally saved */
  baselineUpdatedAt: string;
};

const CLIENT_ID_KEY = "sb-presence-client";

function getPresenceClientId(): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function stampNow(note: CanvasNote): CanvasNote {
  return { ...note, updatedAt: new Date().toISOString() };
}

function mergeRemoteNotes(
  local: CanvasNote[],
  remote: CanvasNote[],
  dirtyNoteId: string | null,
): CanvasNote[] {
  const localById = new Map(local.map((n) => [n.id, n]));
  const merged: CanvasNote[] = [];

  for (const remoteNote of remote) {
    const current = localById.get(remoteNote.id);
    if (!current) {
      merged.push(remoteNote);
      continue;
    }

    // Don't overwrite fields of a note the user is actively editing
    if (dirtyNoteId && dirtyNoteId === remoteNote.id) {
      merged.push(current);
      continue;
    }

    const localTs = Date.parse(current.updatedAt || "");
    const remoteTs = Date.parse(remoteNote.updatedAt || "");
    merged.push(
      Number.isFinite(remoteTs) && remoteTs >= (Number.isFinite(localTs) ? localTs : 0)
        ? remoteNote
        : current,
    );
  }

  return merged;
}

/**
 * In-place per-note merge for single-note remote events (note.updated /
 * note.moved). Unlike mergeRemoteNotes, this keeps every local note and only
 * replaces the one that changed, so a live edit can never wipe the board.
 */
function applyRemoteNote(
  local: CanvasNote[],
  note: CanvasNote,
  dirtyNoteId: string | null,
): CanvasNote[] {
  return local.map((n) =>
    n.id === note.id
      ? dirtyNoteId === note.id
        ? n
        : Date.parse(note.updatedAt || "") >= Date.parse(n.updatedAt || "")
          ? note
          : n
      : n,
  );
}

/** noteId → peer editor (excludes this browser tab only). */
function mapFromEditors(
  editors: PresenceEditor[],
  selfClientId: string,
): Record<string, PresenceEditor> {
  const next: Record<string, PresenceEditor> = {};
  for (const editor of editors) {
    if (editor.clientId === selfClientId) continue;
    next[editor.noteId] = editor;
  }
  return next;
}

function peerLabel(editor: PresenceEditor, selfUserId: string): string {
  if (editor.userId === selfUserId) return "Another tab";
  return editor.userName;
}

async function postPresence(
  board: string,
  clientId: string,
  action: "editing" | "idle",
  noteId: string,
) {
  try {
    await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board, action, noteId, clientId }),
      keepalive: action === "idle",
    });
  } catch {
    // Presence is best-effort; the realtime stream syncs content.
  }
}

function BoardAppInner({
  isAdmin,
  currentUserId,
  initialNotes,
}: BoardAppProps) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "list" ? "list" : "canvas";
  const board =
    searchParams.get("board") === "private" ? "private" : "team";

  const [notes, setNotes] = useState(initialNotes);
  const [search, setSearch] = useState("");
  const [openState, setOpenState] = useState<OpenState | null>(null);
  const [loading, setLoading] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [editingByNoteId, setEditingByNoteId] = useState<
    Record<string, PresenceEditor>
  >({});
  const [viewerClientIds, setViewerClientIds] = useState<Set<string>>(
    new Set(),
  );
  const [conflict, setConflict] = useState<string | null>(null);
  const dirtyNoteIdRef = useRef<string | null>(null);
  const lastEventSeqRef = useRef<number | null>(null);
  const notesRef = useRef(notes);
  const openNoteIdRef = useRef<string | null>(null);
  // Tracks the board whose server-rendered notes are currently displayed.
  // `null` until the first paint; afterwards it holds the last-seen `board`
  // value so we only clear the canvas when the board actually changes.
  const displayedBoardRef = useRef<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  notesRef.current = notes;
  openNoteIdRef.current = openState?.note.id ?? null;

  useEffect(() => {
    setClientId(getPresenceClientId());
  }, []);

  // If the editor opened before clientId was ready, claim presence now.
  useEffect(() => {
    if (!clientId || !openState) return;
    void postPresence(board, clientId, "editing", openState.note.id);
  }, [clientId, board, openState?.note.id]); // eslint-disable-line react-hooks/exhaustive-deps -- only when client/note identity changes
  // Phase 2: keep presence alive while a note is open (server TTL is 90s)
  useEffect(() => {
    if (!clientId || !openState) return;
    const interval = window.setInterval(() => {
      void postPresence(board, clientId, "editing", openState.note.id);
    }, 45000);
    return () => window.clearInterval(interval);
  }, [clientId, board, openState?.note.id]); // eslint-disable-line react-hooks/exhaustive-deps -- only while the open note identity is stable

  useEffect(() => {
    dirtyNoteIdRef.current =
      editorDirty && openState ? openState.note.id : null;
  }, [editorDirty, openState]);

  const syncNotes = useCallback(async (opts?: { showLoading?: boolean }) => {
    if (opts?.showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/notes?board=${board}`);
      if (!response.ok) return;
      const data = (await response.json()) as { notes: CanvasNote[] };
      setNotes((prev) =>
        mergeRemoteNotes(prev, data.notes, dirtyNoteIdRef.current),
      );
    } finally {
      if (opts?.showLoading) setLoading(false);
    }
  }, [board]);

  // Initial / board-switch load
  useEffect(() => {
    if (displayedBoardRef.current === null) {
      // First paint: show the server-rendered notes for the current board
      // immediately instead of waiting on the fetch.
      setNotes(initialNotes);
    } else if (displayedBoardRef.current !== board) {
      // Board param changed: clear the previous board's notes so we don't
      // briefly show stale notes while the new board's fetch is running.
      // The loading state (notes.length === 0) covers the gap.
      setNotes([]);
    }
    // `initialNotes` is intentionally omitted from the deps: page.tsx rebuilds
    // it on every soft navigation (notes.map(serializeNote)), so including it
    // would re-trigger this effect for unrelated view toggles.
    displayedBoardRef.current = board;
    setEditingByNoteId({});
    setViewerClientIds(new Set());
    void syncNotes({ showLoading: true });
  }, [board, syncNotes]); // eslint-disable-line react-hooks/exhaustive-deps -- initialNotes only used for first paint

  // Refetch when the tab becomes visible (backstop; live sync is push-based)
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void syncNotes();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [syncNotes]);

  // Phase 2: unified realtime stream (note.* + presence.*) per board
  useEffect(() => {
    if (!clientId) return;
    const selfClientId = clientId;
    // Seq is per-board (per-room); reset so a prior board's high seq cannot
    // suppress this board's authoritative note.snapshot.
    lastEventSeqRef.current = null;

    // Track the highest SSE event id applied so a late note.snapshot (whose
    // data.seq was captured before these events) can be skipped.
    function trackSeq(ev: MessageEvent) {
      const seq = Number(ev.lastEventId);
      if (
        Number.isFinite(seq) &&
        (lastEventSeqRef.current == null || seq > lastEventSeqRef.current)
      ) {
        lastEventSeqRef.current = seq;
      }
    }

    const source = new EventSource(
      `/api/realtime/stream?board=${board}&clientId=${encodeURIComponent(selfClientId)}`,
    );
    // The server-side room (and its seq) can be swept and recreated; reset on
    // every (re)connect so the first snapshot is always applied.
    source.addEventListener("open", () => {
      lastEventSeqRef.current = null;
    });

    function onSnapshot(ev: MessageEvent) {
      try {
        const data = JSON.parse(ev.data) as { editors: PresenceEditor[] };
        setViewerClientIds(
          new Set((data.editors ?? []).map((editor) => editor.clientId)),
        );
        setEditingByNoteId(mapFromEditors(data.editors ?? [], selfClientId));
      } catch {
        // ignore malformed
      }
    }

    function onEditing(ev: MessageEvent) {
      trackSeq(ev);
      try {
        const editor = JSON.parse(ev.data) as PresenceEditor;
        setViewerClientIds((prev) => {
          const next = new Set(prev);
          next.add(editor.clientId);
          return next;
        });
        if (editor.clientId === selfClientId) return;
        setEditingByNoteId((prev) => {
          const next = { ...prev };
          for (const [noteId, current] of Object.entries(next)) {
            if (
              current.clientId === editor.clientId &&
              noteId !== editor.noteId
            ) {
              delete next[noteId];
            }
          }
          next[editor.noteId] = editor;
          return next;
        });
      } catch {
        // ignore
      }
    }

    function onIdle(ev: MessageEvent) {
      trackSeq(ev);
      try {
        const data = JSON.parse(ev.data) as {
          noteId: string;
          userId: string;
          clientId: string;
        };
        setViewerClientIds((prev) => {
          const next = new Set(prev);
          next.delete(data.clientId);
          return next;
        });
        if (data.clientId === selfClientId) return;
        setEditingByNoteId((prev) => {
          const current = prev[data.noteId];
          if (!current || current.clientId !== data.clientId) return prev;
          const next = { ...prev };
          delete next[data.noteId];
          return next;
        });
      } catch {
        // ignore
      }
    }

    function onLeave(ev: MessageEvent) {
      trackSeq(ev);
      try {
        const data = JSON.parse(ev.data) as { clientId: string };
        setViewerClientIds((prev) => {
          const next = new Set(prev);
          next.delete(data.clientId);
          return next;
        });
        if (data.clientId === selfClientId) return;
        setEditingByNoteId((prev) => {
          const next = { ...prev };
          for (const [noteId, current] of Object.entries(next)) {
            if (current.clientId === data.clientId) delete next[noteId];
          }
          return next;
        });
      } catch {
        // ignore
      }
    }

    function onNoteSnapshot(ev: MessageEvent) {
      try {
        const data = JSON.parse(ev.data) as {
          notes: CanvasNote[];
          seq?: number;
        };
        if (
          lastEventSeqRef.current != null &&
          data.seq != null &&
          lastEventSeqRef.current > data.seq
        ) {
          // Snapshot predates events already applied — skip so it cannot
          // revert them. Fresh connections still apply the authoritative
          // snapshot (reconnect-healing path).
          return;
        }
        setNotes((prev) =>
          mergeRemoteNotes(prev, data.notes ?? [], dirtyNoteIdRef.current),
        );
      } catch {
        // ignore
      }
    }

    function onNoteCreated(ev: MessageEvent) {
      trackSeq(ev);
      try {
        const data = JSON.parse(ev.data) as { note: CanvasNote };
        setNotes((prev) =>
          prev.some((n) => n.id === data.note.id)
            ? prev
            : [...prev, data.note],
        );
      } catch {
        // ignore
      }
    }

    function onNoteUpdated(ev: MessageEvent) {
      trackSeq(ev);
      try {
        const data = JSON.parse(ev.data) as { note: CanvasNote };
        setNotes((prev) =>
          applyRemoteNote(prev, data.note, dirtyNoteIdRef.current),
        );
      } catch {
        // ignore
      }
    }

    function onNoteDeleted(ev: MessageEvent) {
      trackSeq(ev);
      try {
        const data = JSON.parse(ev.data) as { noteId: string };
        setNotes((prev) => prev.filter((n) => n.id !== data.noteId));
        setOpenState((current) =>
          current?.note.id === data.noteId ? null : current,
        );
      } catch {
        // ignore
      }
    }

    function onNoteRestored(ev: MessageEvent) {
      trackSeq(ev);
      try {
        const data = JSON.parse(ev.data) as { note: CanvasNote };
        setNotes((prev) =>
          prev.some((n) => n.id === data.note.id)
            ? prev
            : [...prev, data.note],
        );
      } catch {
        // ignore
      }
    }

    source.addEventListener("presence.snapshot", onSnapshot as EventListener);
    source.addEventListener("presence.editing", onEditing as EventListener);
    source.addEventListener("presence.idle", onIdle as EventListener);
    source.addEventListener("presence.leave", onLeave as EventListener);
    source.addEventListener("note.snapshot", onNoteSnapshot as EventListener);
    source.addEventListener("note.created", onNoteCreated as EventListener);
    source.addEventListener("note.updated", onNoteUpdated as EventListener);
    source.addEventListener("note.moved", onNoteUpdated as EventListener);
    source.addEventListener("note.deleted", onNoteDeleted as EventListener);
    source.addEventListener("note.restored", onNoteRestored as EventListener);

    return () => {
      source.removeEventListener(
        "presence.snapshot",
        onSnapshot as EventListener,
      );
      source.removeEventListener(
        "presence.editing",
        onEditing as EventListener,
      );
      source.removeEventListener("presence.idle", onIdle as EventListener);
      source.removeEventListener("presence.leave", onLeave as EventListener);
      source.removeEventListener(
        "note.snapshot",
        onNoteSnapshot as EventListener,
      );
      source.removeEventListener(
        "note.created",
        onNoteCreated as EventListener,
      );
      source.removeEventListener(
        "note.updated",
        onNoteUpdated as EventListener,
      );
      source.removeEventListener("note.moved", onNoteUpdated as EventListener);
      source.removeEventListener(
        "note.deleted",
        onNoteDeleted as EventListener,
      );
      source.removeEventListener(
        "note.restored",
        onNoteRestored as EventListener,
      );
      source.close();
      const openId = openNoteIdRef.current;
      if (openId) {
        void postPresence(board, selfClientId, "idle", openId);
      }
    };
  }, [board, clientId]);

  function openNote(note: CanvasNote) {
    const previousId = openNoteIdRef.current;
    if (clientId && previousId && previousId !== note.id) {
      void postPresence(board, clientId, "idle", previousId);
    }
    const origin = getNoteOriginRect(note.id);
    setEditorDirty(false);
    setConflict(null);
    setOpenState({
      note,
      origin,
      baselineUpdatedAt: note.updatedAt,
    });
    if (clientId) void postPresence(board, clientId, "editing", note.id);
  }

  async function createAt(x: number, y: number) {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board, x, y }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { note: CanvasNote };
    setNotes((prev) =>
      prev.some((n) => n.id === data.note.id) ? prev : [...prev, data.note],
    );
    requestAnimationFrame(() => {
      requestAnimationFrame(() => openNote(data.note));
    });
  }

  const moveNote = useCallback(async (id: string, x: number, y: number, zIndex: number) => {
    const previous = notesRef.current.find((note) => note.id === id);
    setNotes((prev) =>
      prev.map((note) =>
        note.id === id ? stampNow({ ...note, x, y, zIndex }) : note,
      ),
    );
    const response = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y, zIndex }),
    });
    if (!response.ok && previous) {
      // GAP-011: revert the optimistic position and resync on failure.
      setNotes((prev) =>
        prev.map((note) => (note.id === id ? previous : note)),
      );
      void syncNotes();
    }
  }, [syncNotes]);

  async function saveNote(input: {
    id: string;
    title: string;
    preview: string;
    color: StickyColorKey;
  }) {
    const response = await fetch(`/api/notes/${input.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        preview: input.preview,
        color: input.color,
        expectedUpdatedAt: openState?.baselineUpdatedAt,
      }),
    });
    if (response.status === 409) {
      // GAP-016: a peer saved while we were editing — surface the conflict.
      const data = (await response.json()) as { note: CanvasNote };
      setNotes((prev) =>
        prev.map((n) => (n.id === data.note.id ? data.note : n)),
      );
      setOpenState((current) =>
        current && current.note.id === data.note.id
          ? {
              ...current,
              note: { ...current.note, updatedAt: data.note.updatedAt },
              baselineUpdatedAt: data.note.updatedAt,
            }
          : current,
      );
      setConflict("This note was updated by someone else — last save wins");
      throw new Error("conflict");
    }
    if (!response.ok) {
      throw new Error("Failed to save note");
    }
    const data = (await response.json()) as { note: CanvasNote };
    setNotes((prev) => prev.map((n) => (n.id === data.note.id ? data.note : n)));
    setOpenState((current) =>
      current && current.note.id === data.note.id
        ? {
            ...current,
            note: { ...current.note, updatedAt: data.note.updatedAt },
            baselineUpdatedAt: data.note.updatedAt,
          }
        : current,
    );
    setEditorDirty(false);
    setConflict(null);
  }

  async function deleteNote(id: string) {
    if (clientId && openNoteIdRef.current === id) {
      void postPresence(board, clientId, "idle", id);
    }
    const response = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (!response.ok) return;
    setNotes((prev) => prev.filter((note) => note.id !== id));
    setOpenState((current) =>
      current?.note.id === id ? null : current,
    );
  }

  function closeEditor() {
    const id = openNoteIdRef.current;
    if (clientId && id) void postPresence(board, clientId, "idle", id);
    setEditorDirty(false);
    setOpenState(null);
  }

  const notesWithPresence = notes.map((note) => {
    const peer = editingByNoteId[note.id];
    return {
      ...note,
      editingBy: peer ? peerLabel(peer, currentUserId) : null,
    };
  });

  const visibleNotes = search.trim()
    ? notesWithPresence.filter(
        (note) =>
          note.title.toLowerCase().includes(search.toLowerCase()) ||
          note.preview.toLowerCase().includes(search.toLowerCase()),
      )
    : notesWithPresence;

  const liveOpen = openState
    ? notes.find((n) => n.id === openState.note.id)
    : undefined;
  const peerSavedWhileOpen =
    openState &&
    liveOpen &&
    Date.parse(liveOpen.updatedAt) > Date.parse(openState.baselineUpdatedAt);
  const peerEditor = openState
    ? editingByNoteId[openState.note.id] ?? null
    : null;
  const editorWarning = peerEditor
    ? `${peerLabel(peerEditor, currentUserId)} is also editing — last save wins`
    : peerSavedWhileOpen
      ? "Someone else saved this note — last save wins"
      : null;

  return (
    <div className="min-h-screen bg-paper">
      <BoardChrome
        isAdmin={isAdmin}
        search={search}
        onSearchChange={setSearch}
      />
      <ViewerChip count={viewerClientIds.size} />
      {loading && notes.length === 0 ? (
        <p className="p-8 text-sm text-ink-muted">Loading notes…</p>
      ) : view === "list" ? (
        <NotesList
          notes={visibleNotes}
          query={search}
          onOpenNote={openNote}
        />
      ) : (
        <BoardCanvas
          notes={visibleNotes}
          openNoteId={openState?.note.id ?? null}
          onCreateAt={createAt}
          onMoveNote={moveNote}
          onOpenNote={openNote}
          onDeleteNote={deleteNote}
        />
      )}
      {openState ? (
        <NoteEditor
          note={openState.note}
          origin={openState.origin}
          warning={editorWarning}
          conflict={conflict}
          onDismissConflict={() => setConflict(null)}
          onDirtyChange={setEditorDirty}
          onClose={closeEditor}
          onSave={saveNote}
          onDelete={deleteNote}
        />
      ) : null}
    </div>
  );
}

export function BoardApp(props: BoardAppProps) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <BoardAppInner {...props} />
    </Suspense>
  );
}
