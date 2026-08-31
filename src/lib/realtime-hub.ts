import type {
  PresenceEditor,
  PresenceEntry,
  ServerEvent,
} from "@/lib/realtime-types";

type Subscriber = {
  id: string;
  userId: string;
  userName: string;
  clientId: string;
  send: (payload: ServerEvent, seq: number) => void;
  /** Last time the hub pushed to this subscriber (event or keepalive). */
  lastSeenAt: number;
};

type Room = {
  /** One open editor per browser tab (clientId). */
  byClientId: Map<string, PresenceEntry>;
  /** One per open SSE connection. */
  subscribers: Map<string, Subscriber>;
  /** Last activity on the room (bookkeeping for the TTL sweep). */
  lastSeenAt: number;
  /** Monotonic per-room sequence, incremented on every broadcast. */
  seq: number;
};

const PRESENCE_TTL_MS = 90_000;
const SWEEP_INTERVAL_MS = 30_000;

const globalForRealtime = globalThis as unknown as {
  __stickyRealtimeRoomsV2?: Map<string, Room>;
  __stickyRealtimeSweepStarted?: boolean;
};

const rooms: Map<string, Room> =
  globalForRealtime.__stickyRealtimeRoomsV2 ??
  (globalForRealtime.__stickyRealtimeRoomsV2 = new Map<string, Room>());

function getRoom(boardId: string): Room {
  let room = rooms.get(boardId);
  if (
    !room ||
    !(room.byClientId instanceof Map) ||
    !(room.subscribers instanceof Map)
  ) {
    room = {
      byClientId: new Map(),
      subscribers: new Map(),
      lastSeenAt: Date.now(),
      seq: 0,
    };
    rooms.set(boardId, room);
  }
  return room;
}

function broadcast(boardId: string, payload: ServerEvent) {
  const room = getRoom(boardId);
  room.lastSeenAt = Date.now();
  room.seq += 1;
  const seq = room.seq;
  for (const sub of room.subscribers.values()) {
    try {
      sub.send(payload, seq);
    } catch {
      // Drop broken subscribers on next unsubscribe
    }
  }
}

/** Current broadcast sequence for a room (0 when the room has no events yet). */
export function currentSeq(boardId: string): number {
  return rooms.get(boardId)?.seq ?? 0;
}

/** Evict presence entries and subscribers whose lastSeenAt is older than the TTL. */
function sweepExpiredPresence() {
  const now = Date.now();
  for (const [boardId, room] of rooms) {
    for (const [clientId, entry] of room.byClientId) {
      if (now - entry.lastSeenAt > PRESENCE_TTL_MS) {
        room.byClientId.delete(clientId);
        broadcast(boardId, {
          event: "presence.leave",
          data: {
            clientId,
            userId: entry.userId,
            userName: entry.userName,
          },
        });
      }
    }
    // A blackholed SSE connection never fires abort/cancel, so its
    // subscriber would leak forever. Evict it along with its presence entry.
    for (const [subId, sub] of room.subscribers) {
      if (now - sub.lastSeenAt > PRESENCE_TTL_MS) {
        room.subscribers.delete(subId);
        const prior = room.byClientId.get(sub.clientId);
        if (prior) {
          room.byClientId.delete(sub.clientId);
        }
        broadcast(boardId, {
          event: "presence.leave",
          data: {
            clientId: sub.clientId,
            userId: prior?.userId ?? sub.userId,
            userName: prior?.userName ?? sub.userName,
          },
        });
      }
    }
    if (room.subscribers.size === 0 && room.byClientId.size === 0) {
      rooms.delete(boardId);
    }
  }
}

/** Lazily start the TTL sweep once per process (HMR-safe via globalThis). */
function startSweep() {
  if (globalForRealtime.__stickyRealtimeSweepStarted) return;
  globalForRealtime.__stickyRealtimeSweepStarted = true;
  setInterval(sweepExpiredPresence, SWEEP_INTERVAL_MS);
}

export function subscribeRealtime(
  boardId: string,
  userId: string,
  userName: string,
  clientId: string,
  send: (payload: ServerEvent, seq: number) => void,
): { subId: string; snapshot: { editors: PresenceEditor[] } } {
  const room = getRoom(boardId);
  const subId = `${clientId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  room.subscribers.set(subId, {
    id: subId,
    userId,
    userName,
    clientId,
    send,
    lastSeenAt: Date.now(),
  });

  // A reconnecting tab keeps its presence entry alive. If it was editing a
  // note, carry the noteId onto the fresh entry and re-announce editing so
  // peers keep seeing the editor (a plain join would drop the noteId).
  const prior = room.byClientId.get(clientId);
  if (prior) {
    prior.lastSeenAt = Date.now();
    if (prior.noteId) {
      const editor: PresenceEditor = {
        clientId,
        userId: prior.userId,
        userName: prior.userName,
        noteId: prior.noteId,
      };
      room.byClientId.set(clientId, { ...editor, lastSeenAt: Date.now() });
      broadcast(boardId, { event: "presence.editing", data: editor });
      startSweep();
      return {
        subId,
        snapshot: { editors: Array.from(room.byClientId.values()) },
      };
    }
  }

  broadcast(boardId, {
    event: "presence.join",
    data: { clientId, userId, userName },
  });
  startSweep();
  return {
    subId,
    snapshot: { editors: Array.from(room.byClientId.values()) },
  };
}

/**
 * Keepalive path: bump a subscriber's lastSeenAt so the sweep never evicts
 * a healthy stream. Returns false when the subscriber is gone so the route
 * can tear the stream down.
 */
export function touchSubscriber(boardId: string, subId: string): boolean {
  const room = rooms.get(boardId);
  return room?.subscribers.has(subId) ?? false;
}

/**
 * Client-initiated liveness: a healthy tab pings every 30s, so its
 * subscriber's lastSeenAt stays fresh; a blackholed connection stops pinging
 * and the TTL sweep evicts it. Room broadcasts and server keepalives must
 * NOT refresh lastSeenAt — they cannot distinguish a dead socket from a live
 * one (enqueue buffers on blackholed streams).
 */
export function pingSubscriber(boardId: string, clientId: string): boolean {
  const room = rooms.get(boardId);
  if (!room) return false;
  let found = false;
  for (const sub of room.subscribers.values()) {
    if (sub.clientId === clientId) {
      sub.lastSeenAt = Date.now();
      found = true;
    }
  }
  return found;
}

export function unsubscribeRealtime(boardId: string, subId: string) {
  const room = rooms.get(boardId);
  if (!room) return;
  const sub = room.subscribers.get(subId);
  room.subscribers.delete(subId);
  if (!sub) return;

  // Reconnect overlap: another subscriber for the same clientId is still
  // connected, so the tab is still live — keep its presence entry and stay
  // silent. Only clear presence when the last subscriber for the clientId
  // goes away.
  const stillConnected = Array.from(room.subscribers.values()).some(
    (s: Subscriber) => s.clientId === sub.clientId,
  );
  if (stillConnected) return;

  // Clear this tab's presence when its SSE connection drops.
  const prior = room.byClientId.get(sub.clientId);
  if (prior) {
    room.byClientId.delete(sub.clientId);
  }
  broadcast(boardId, {
    event: "presence.leave",
    data: {
      clientId: sub.clientId,
      userId: prior?.userId ?? sub.userId,
      userName: prior?.userName ?? sub.userName,
    },
  });

  if (room.subscribers.size === 0 && room.byClientId.size === 0) {
    rooms.delete(boardId);
  }
}

export function setEditing(
  boardId: string,
  editor: PresenceEditor,
): PresenceEditor {
  const room = getRoom(boardId);
  const prior = room.byClientId.get(editor.clientId);
  if (prior && prior.noteId !== editor.noteId) {
    broadcast(boardId, {
      event: "presence.idle",
      data: {
        noteId: prior.noteId,
        userId: editor.userId,
        clientId: editor.clientId,
      },
    });
  }
  room.byClientId.set(editor.clientId, { ...editor, lastSeenAt: Date.now() });
  broadcast(boardId, { event: "presence.editing", data: editor });
  return editor;
}

export function setIdle(
  boardId: string,
  clientId: string,
  noteId?: string,
): { noteId: string; userId: string; clientId: string } | null {
  const room = getRoom(boardId);
  const prior = room.byClientId.get(clientId);
  if (!prior) return null;
  if (noteId && prior.noteId !== noteId) return null;
  room.byClientId.delete(clientId);
  const payload = {
    noteId: prior.noteId,
    userId: prior.userId,
    clientId,
  };
  broadcast(boardId, { event: "presence.idle", data: payload });
  return payload;
}

/** Fan a note.* event out to every subscriber of the board's room. */
export function broadcastNote(boardId: string, event: ServerEvent) {
  broadcast(boardId, event);
}
