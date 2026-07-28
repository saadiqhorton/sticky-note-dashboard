export type PresenceEditor = {
  clientId: string;
  noteId: string;
  userId: string;
  userName: string;
};

type PresenceEvent =
  | { event: "presence.snapshot"; data: { editors: PresenceEditor[] } }
  | { event: "presence.editing"; data: PresenceEditor }
  | {
      event: "presence.idle";
      data: { noteId: string; userId: string; clientId: string };
    };

type Subscriber = {
  id: string;
  userId: string;
  clientId: string;
  send: (payload: PresenceEvent) => void;
};

type BoardRoom = {
  /** One open editor per browser tab (clientId). */
  byClientId: Map<string, PresenceEditor>;
  subscribers: Map<string, Subscriber>;
};

const globalForPresence = globalThis as unknown as {
  __stickyPresenceRoomsV2?: Map<string, BoardRoom>;
};

const rooms =
  globalForPresence.__stickyPresenceRoomsV2 ??
  (globalForPresence.__stickyPresenceRoomsV2 = new Map());

function getRoom(boardId: string): BoardRoom {
  let room = rooms.get(boardId);
  if (
    !room ||
    !(room.byClientId instanceof Map) ||
    !(room.subscribers instanceof Map)
  ) {
    room = { byClientId: new Map(), subscribers: new Map() };
    rooms.set(boardId, room);
  }
  return room;
}

function listEditors(room: BoardRoom): PresenceEditor[] {
  return Array.from(room.byClientId.values());
}

function broadcast(boardId: string, payload: PresenceEvent) {
  const room = getRoom(boardId);
  for (const sub of room.subscribers.values()) {
    try {
      sub.send(payload);
    } catch {
      // Drop broken subscribers on next unsubscribe
    }
  }
}

export function subscribePresence(
  boardId: string,
  userId: string,
  clientId: string,
  send: (payload: PresenceEvent) => void,
): { subId: string; snapshot: PresenceEditor[] } {
  const room = getRoom(boardId);
  const subId = `${clientId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  room.subscribers.set(subId, { id: subId, userId, clientId, send });
  return { subId, snapshot: listEditors(room) };
}

export function unsubscribePresence(boardId: string, subId: string) {
  const room = rooms.get(boardId);
  if (!room) return;
  const sub = room.subscribers.get(subId);
  room.subscribers.delete(subId);
  if (!sub) return;

  // Clear this tab's presence when its SSE connection drops.
  const prior = room.byClientId.get(sub.clientId);
  if (prior) {
    room.byClientId.delete(sub.clientId);
    broadcast(boardId, {
      event: "presence.idle",
      data: {
        noteId: prior.noteId,
        userId: prior.userId,
        clientId: sub.clientId,
      },
    });
  }

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
  room.byClientId.set(editor.clientId, editor);
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
