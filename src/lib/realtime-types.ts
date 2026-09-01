import type { StickyColorKey } from "@/lib/theme";

/** One open editor per browser tab, as broadcast by the server. */
export type PresenceEditor = {
  clientId: string;
  noteId: string;
  userId: string;
  userName: string;
};

/** PresenceEditor plus server-side TTL bookkeeping (never sent to clients). */
export type PresenceEntry = PresenceEditor & {
  lastSeenAt: number;
};

/** Shape of `serializeNote()` output, as carried by note.* events. */
export type SerializedNote = {
  id: string;
  title: string;
  preview: string;
  color: StickyColorKey;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rotation: number;
  updatedAt: string;
  editingBy: string | null;
};

/**
 * Every message the server pushes on the per-board realtime stream.
 *
 * note.* events are broadcast only after a committed DB write, with the
 * freshly serialized note (server `updatedAt`). presence.* events track
 * editor state per clientId (browser tab). `note.snapshot` is sent on every
 * (re)subscription so a reconnecting client reconciles anything it missed.
 */
export type ServerEvent =
  | { event: "note.created"; data: { boardId: string; note: SerializedNote } }
  | { event: "note.updated"; data: { boardId: string; note: SerializedNote } }
  | { event: "note.moved"; data: { boardId: string; note: SerializedNote } }
  | { event: "note.deleted"; data: { boardId: string; noteId: string } }
  | { event: "note.restored"; data: { boardId: string; note: SerializedNote } }
  | {
      event: "note.snapshot";
      data: { notes: SerializedNote[]; seq?: number };
    }
  | { event: "presence.snapshot"; data: { editors: PresenceEditor[] } }
  | {
      event: "presence.join";
      data: { clientId: string; userId: string; userName: string };
    }
  | {
      event: "presence.leave";
      data: { clientId: string; userId: string; userName: string };
    }
  | { event: "presence.editing"; data: PresenceEditor }
  | {
      event: "presence.idle";
      data: { noteId: string; userId: string; clientId: string };
    };
