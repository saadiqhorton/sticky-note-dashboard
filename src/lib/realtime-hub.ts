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
// Bound per-room connection growth: one member must not be able to exhaust
// memory/FDs by opening unbounded streams (clientId is caller-chosen).
const MAX_SUBSCRIBERS_PER_ROOM = 100;
const MAX_SUBSCRIBERS_PER_USER = 20;

const globalForRealtime = globalThis as unknown as {
  __stickyRealtimeRoomsV2?: Map<string, Room>;
  __stickyRealtimeSweepStarted?: boolean;
  /** Monotonic subscriber counter (HMR-safe) — subId tie-breaker. */
  __stickySubCounter?: number;
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

export function canSubscribe(
  boardId: string,
  userId: string,
): string | null {
  const room = rooms.get(boardId);
  if (!room) return null;
  if (room.subscribers.size >= MAX_SUBSCRIBERS_PER_ROOM) {
    return "room_full";
  }
  let sameUser = 0;
  for (const sub of room.subscribers.values()) {
    if (sub.userId === userId) sameUser += 1;
  }
  if (sameUser >= MAX_SUBSCRIBERS_PER_USER) {
    return "too_many_connections";
  }
  return null;
}

export function subscribeRealtime(
  boardId: string,
  userId: string,
  userName: string,
  clientId: string,
  send: (payload: ServerEvent, seq: number) => void,
): { subId: string; snapshot: { editors: PresenceEditor[] } } | { error: string } {
  const room = getRoom(boardId);
  const capError = canSubscribe(boardId, userId);
  if (capError) return { error: capError };
  const subCounter = globalForRealtime.__stickySubCounter ?? 0;
  globalForRealtime.__stickySubCounter = subCounter + 1;
  const subId = `${clientId}:${Date.now()}:${subCounter}`;
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
export function pingSubscriber(
  boardId: string,
  clientId: string,
  userId: string,
): boolean {
  const room = rooms.get(boardId);
  if (!room) return false;
  // Bump only the newest subscriber for this tab owned by this user: after an
  // EventSource reconnect the prior (possibly blackholed) connection lingers
  // until the sweep evicts it — pinging it too would keep the zombie alive.
  // The monotonic counter in the subId breaks same-millisecond ties.
  let newest: Subscriber | null = null;
  let newestSeq = -1;
  for (const sub of room.subscribers.values()) {
    if (sub.clientId !== clientId || sub.userId !== userId) continue;
    const seq = Number(sub.id.split(":").at(-1) ?? 0);
    if (seq > newestSeq) {
      newestSeq = seq;
      newest = sub;
    }
  }
  if (!newest) return false;
  newest.lastSeenAt = Date.now();
  return true;
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
): PresenceEditor | null {
  const room = getRoom(boardId);
  const prior = room.byClientId.get(editor.clientId);
  // A clientId names a specific tab; only its owner may update it. Prevents a
  // teammate from hijacking or clearing another tab's editing presence.
  if (prior && prior.userId !== editor.userId) {
    return null;
  }
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
  userId: string,
  noteId?: string,
): { noteId: string; userId: string; clientId: string } | null {
  const room = getRoom(boardId);
  const prior = room.byClientId.get(clientId);
  if (!prior) return null;
  if (prior.userId !== userId) return null;
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
