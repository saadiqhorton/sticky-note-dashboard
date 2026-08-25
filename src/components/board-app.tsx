"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BoardChrome } from "@/components/board-chrome";
import { BoardCanvas } from "@/components/board-canvas";
import { NotesList } from "@/components/notes-list";
import { NoteEditor } from "@/components/note-editor";
import type { CanvasNote } from "@/components/sticky-note-card";
import type { StickyColorKey } from "@/lib/theme";
import { getNoteOriginRect, type NoteOriginRect } from "@/lib/note-origin";

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

type PresenceEditor = {
  clientId: string;
  noteId: string;
  userId: string;
  userName: string;
};

const POLL_MS = 2500;
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
    // Presence is best-effort; Phase 1 poll still syncs content.
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
  const dirtyNoteIdRef = useRef<string | null>(null);
  const notesRef = useRef(notes);
  const openNoteIdRef = useRef<string | null>(null);
  // Tracks whether this effect has run once, so the server-rendered notes are
  // only used for the very first paint and not reused after a board switch.
  const firstBoardRef = useRef(true);
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
    if (firstBoardRef.current) {
      // First paint: show the server-rendered notes for the current board
      // immediately instead of waiting on the fetch.
      setNotes(initialNotes);
      firstBoardRef.current = false;
    } else {
      // Board param changed: clear the previous board's notes so we don't
      // briefly show stale notes while the new board's fetch is running.
      // The loading state (notes.length === 0) covers the gap.
      setNotes([]);
    }
    setEditingByNoteId({});
    void syncNotes({ showLoading: true });
  }, [board, syncNotes, initialNotes]); // initialNotes only used for first paint

  // Phase 1: poll + refetch when tab becomes visible
  useEffect(() => {
    const interval = window.setInterval(() => {
      void syncNotes();
    }, POLL_MS);

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void syncNotes();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [syncNotes]);

  // Phase 2a: SSE presence stream (per-tab clientId so same-user tabs see each other)
  useEffect(() => {
    if (!clientId) return;
    const selfClientId = clientId;

    const source = new EventSource(
      `/api/presence/stream?board=${board}&clientId=${encodeURIComponent(selfClientId)}`,
    );

    function onSnapshot(ev: MessageEvent) {
      try {
        const data = JSON.parse(ev.data) as { editors: PresenceEditor[] };
        setEditingByNoteId(mapFromEditors(data.editors ?? [], selfClientId));
      } catch {
        // ignore malformed
      }
    }

    function onEditing(ev: MessageEvent) {
      try {
        const editor = JSON.parse(ev.data) as PresenceEditor;
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
      try {
        const data = JSON.parse(ev.data) as {
          noteId: string;
          userId: string;
          clientId: string;
        };
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

    source.addEventListener("presence.snapshot", onSnapshot as EventListener);
    source.addEventListener("presence.editing", onEditing as EventListener);
    source.addEventListener("presence.idle", onIdle as EventListener);

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
    setNotes((prev) => [...prev, data.note]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => openNote(data.note));
    });
  }

  const moveNote = useCallback(async (id: string, x: number, y: number, zIndex: number) => {
    setNotes((prev) =>
      prev.map((note) =>
        note.id === id ? stampNow({ ...note, x, y, zIndex }) : note,
      ),
    );
    await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y, zIndex }),
    });
  }, []);

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
      }),
    });
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
