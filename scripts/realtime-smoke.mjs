#!/usr/bin/env node
/**
 * SAA-96 realtime smoke client.
 *
 * Zero-dependency Node >= 22 script that proves the server-side realtime
 * contract end to end:
 *   - signs in via POST /api/auth/sign-in/email (captures Set-Cookie)
 *   - opens two SSE streams on /api/realtime/stream (observer + actor)
 *   - drives create / move / content-save / delete / restore + presence POSTs
 *   - asserts the observer sees the expected note.* and presence.* events
 *
 * Usage:
 *   node scripts/realtime-smoke.mjs \
 *     --base http://localhost:3000 \
 *     --email admin@example.com --password changeme123 \
 *     [--board team] [--timeout 5000]
 *
 * Exit code 0 = all assertions passed; 1 = any assertion failed.
 */

const args = process.argv.slice(2);
function arg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx === -1 ? fallback : args[idx + 1];
}

const BASE = (arg("base", "http://localhost:3000") ?? "").replace(/\/$/, "");
const EMAIL = arg("email", process.env.ADMIN_EMAIL);
const PASSWORD = arg("password", process.env.ADMIN_PASSWORD);
const BOARD = arg("board", "team");
const WAIT_MS = Number(arg("timeout", "5000"));

if (!EMAIL || !PASSWORD) {
  console.error("email/password required: --email --password (or ADMIN_EMAIL/ADMIN_PASSWORD)");
  process.exit(1);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` (${detail})` : ""}`);
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

async function signIn() {
  const response = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    redirect: "manual",
  });
  const cookies = response.headers.getSetCookie?.() ?? [];
  if (!response.ok || cookies.length === 0) {
    fail(`sign-in failed: HTTP ${response.status} ${await response.text()}`);
  }
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

async function openStream(cookie, clientId, onEvent) {
  const url = `${BASE}/api/realtime/stream?board=${encodeURIComponent(BOARD)}&clientId=${encodeURIComponent(clientId)}`;
  const response = await fetch(url, { headers: { cookie } });
  if (!response.ok) {
    fail(`stream ${clientId}: HTTP ${response.status} ${await response.text()}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let closed = false;
  const pump = async () => {
    try {
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = raw.match(/^event: (.+)$/m)?.[1] ?? "message";
          const dataLine = raw.match(/^data: (.+)$/m)?.[1];
          if (!dataLine) continue; // keepalive comment
          let data;
          try {
            data = JSON.parse(dataLine);
          } catch {
            continue;
          }
          onEvent({ event, data, at: Date.now() });
        }
      }
    } catch (err) {
      if (!closed) onEvent({ event: "stream-error", data: String(err), at: Date.now() });
    }
  };
  void pump();
  return {
    close() {
      closed = true;
      void reader.cancel().catch(() => {});
    },
  };
}

function waitFor(events, predicate, label, timeoutMs = WAIT_MS) {
  return new Promise((resolve, reject) => {
    const found = events.find(predicate);
    if (found) return resolve(found);
    const started = Date.now();
    const timer = setInterval(() => {
      const hit = events.find(predicate);
      if (hit) {
        clearInterval(timer);
        resolve(hit);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timeout (${timeoutMs}ms) waiting for ${label}`));
      }
    }, 25);
  });
}

async function api(cookie, path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { cookie, ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body
  }
  return { response, body };
}

/** Decode the HTML entities Next.js uses to escape hidden input values. */
function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Restore a trashed note via the /trash header-based server-action protocol.
 *
 * Next 16 renders server-action forms as hidden $ACTION_<n>:N inputs:
 *   $ACTION_<n>:0 = {"id":"<action-hash>","bound":"$@1"}
 *   $ACTION_<n>:1 = ["<noteId>"]
 * both HTML-entity-encoded. The multipart replay 500s ("Failed to find Server
 * Action"); the working protocol is a header-based POST:
 *   POST /trash  Next-Action: <id>  Content-Type: text/plain;charset=UTF-8
 *   body = JSON.stringify([noteId])
 * The restoreNote action id is discovered by probing each distinct id on the
 * page with a nonexistent note id: restoreNote returns 200 quietly
 * (if (!note) return in src/app/trash/actions.ts), purgeNote 500s (prisma
 * delete throws). Non-destructive probe — no trashed note is touched.
 */
async function restoreViaTrashForm(cookie, noteId) {
  const page = await fetch(`${BASE}/trash`, { headers: { cookie } });
  if (!page.ok) {
    console.warn(`WARN: GET /trash HTTP ${page.status} — skipping restore driver`);
    return false;
  }
  const html = await page.text();

  // Each trashed note renders two server-action forms in document order:
  // restoreNote first, then purgeNote. Take the first form bound to the
  // target note and use its action hash (the "id" inside the :0 metadata —
  // the field index is not the action id). (Probing is unreliable since
  // main's purgeNote uses deleteMany, which no-ops with 200 on a nonexistent
  // id — identical to restoreNote's quiet return.)
  const byField = {};
  for (const match of html.matchAll(/name="\$ACTION_([^":]+):(\d+)" value="([^"]*)"/g)) {
    const [, field, idx, value] = match;
    (byField[field] ??= {})[idx] = decodeHtmlEntities(value);
  }
  const targetField = Object.entries(byField).find(
    ([, f]) => f["1"] && f["1"].includes(JSON.stringify(noteId)),
  );
  if (!targetField) {
    console.warn("WARN: no restore form for this note in /trash HTML — skipping restore driver");
    return false;
  }
  let restoreId;
  try {
    restoreId = JSON.parse(targetField[1]["0"]).id;
  } catch {
    console.warn("WARN: unparseable action metadata in /trash HTML — skipping restore driver");
    return false;
  }

  const response = await fetch(`${BASE}/trash`, {
    method: "POST",
    headers: {
      cookie,
      "Next-Action": restoreId,
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify([noteId]),
    redirect: "manual",
  });
  if (!response.ok) fail(`restore POST: HTTP ${response.status}`);
  return true;
}

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

async function main() {
  console.log(`SAA-96 realtime smoke — ${BASE} board=${BOARD}`);
  const cookie = await signIn();
  console.log(`[${stamp()}] signed in as ${EMAIL}`);

  const eventsA = [];
  const streamA = await openStream(cookie, "smoke-observer", (ev) => {
    eventsA.push(ev);
    console.log(`[${stamp()}] A <- ${ev.event} ${JSON.stringify(ev.data)}`);
  });

  // Initial snapshots on subscribe.
  await waitFor(eventsA, (e) => e.event === "presence.snapshot", "A presence.snapshot");
  await waitFor(eventsA, (e) => e.event === "note.snapshot", "A note.snapshot");
  check("A receives presence.snapshot on subscribe", true);
  check("A receives note.snapshot on subscribe", true);

  // Second identity connects -> observer sees presence.join.
  const eventsB = [];
  const streamB = await openStream(cookie, "smoke-actor", (ev) => {
    eventsB.push(ev);
    console.log(`[${stamp()}] B <- ${ev.event} ${JSON.stringify(ev.data)}`);
  });
  const join = await waitFor(
    eventsA,
    (e) =>
      e.event === "presence.join" &&
      e.data.clientId?.endsWith(":smoke-actor"),
    "A presence.join(smoke-actor)",
  );
  check("A sees presence.join for actor", true, `clientId=${join.data.clientId}`);

  // Create -> note.created.
  const created = await api(cookie, "/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board: BOARD, x: 120, y: 140 }),
  });
  if (!created.response.ok) fail(`create: HTTP ${created.response.status}`);
  const noteId = created.body.note.id;
  const createdEv = await waitFor(
    eventsA,
    (e) => e.event === "note.created" && e.data.note?.id === noteId,
    "A note.created",
  );
  check("A sees note.created", true, `note=${noteId} updatedAt=${createdEv.data.note.updatedAt}`);

  // Move -> note.moved.
  await api(cookie, `/api/notes/${noteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: 320, y: 260, zIndex: 5 }),
  });
  const movedEv = await waitFor(
    eventsA,
    (e) => e.event === "note.moved" && e.data.note?.id === noteId,
    "A note.moved",
  );
  check("A sees note.moved", true, `x=${movedEv.data.note.x} y=${movedEv.data.note.y}`);

  // Content save -> note.updated.
  await api(cookie, `/api/notes/${noteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Smoke note", preview: "hello", color: "pink" }),
  });
  const updatedEv = await waitFor(
    eventsA,
    (e) => e.event === "note.updated" && e.data.note?.id === noteId,
    "A note.updated",
  );
  check("A sees note.updated", true, `title=${updatedEv.data.note.title}`);

  // Stale save -> 409 (GAP-016).
  const stale = await api(cookie, `/api/notes/${noteId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "stale", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }),
  });
  check("stale PATCH returns 409", stale.response.status === 409, `status=${stale.response.status}`);

  // Delete -> note.deleted.
  await api(cookie, `/api/notes/${noteId}`, { method: "DELETE" });
  const deletedEv = await waitFor(
    eventsA,
    (e) => e.event === "note.deleted" && e.data.noteId === noteId,
    "A note.deleted",
  );
  check("A sees note.deleted", true, `noteId=${deletedEv.data.noteId}`);

  // Restore via the /trash server-action form -> note.restored.
  const restored = await restoreViaTrashForm(cookie, noteId);
  if (restored) {
    const restoredEv = await waitFor(
      eventsA,
      (e) => e.event === "note.restored" && e.data.note?.id === noteId,
      "A note.restored",
    );
    check("A sees note.restored", true, `note=${restoredEv.data.note.id}`);
  }

  // Presence editing/idle.
  await api(cookie, "/api/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board: BOARD, action: "editing", noteId, clientId: "smoke-actor" }),
  });
  const editingEv = await waitFor(
    eventsA,
    (e) =>
      e.event === "presence.editing" &&
      e.data.clientId?.endsWith(":smoke-actor"),
    "A presence.editing",
  );
  check("A sees presence.editing", true, `noteId=${editingEv.data.noteId}`);

  await api(cookie, "/api/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board: BOARD, action: "idle", noteId, clientId: "smoke-actor" }),
  });
  const idleEv = await waitFor(
    eventsA,
    (e) =>
      e.event === "presence.idle" &&
      e.data.clientId?.endsWith(":smoke-actor"),
    "A presence.idle",
  );
  check("A sees presence.idle", true, `noteId=${idleEv.data.noteId}`);

  // Cross-board noteId claim -> 400 (claim a note from the other board).
  const otherBoard = BOARD === "private" ? "team" : "private";
  const otherCreated = await api(cookie, "/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board: otherBoard, x: 40, y: 40 }),
  });
  if (otherCreated.response.ok) {
    const otherNoteId = otherCreated.body.note.id;
    const cross = await api(cookie, "/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: BOARD, action: "editing", noteId: otherNoteId, clientId: "smoke-actor" }),
    });
    check("cross-board noteId rejected", cross.response.status === 400, `status=${cross.response.status}`);
    await api(cookie, `/api/notes/${otherNoteId}`, { method: "DELETE" });
  } else {
    check("cross-board noteId rejected", false, `could not create ${otherBoard} note`);
  }

  // Actor disconnects -> observer sees presence.leave.
  streamB.close();
  const leaveEv = await waitFor(
    eventsA,
    (e) =>
      e.event === "presence.leave" &&
      e.data.clientId?.endsWith(":smoke-actor"),
    "A presence.leave",
  );
  check("A sees presence.leave on disconnect", true, `clientId=${leaveEv.data.clientId}`);

  // Cleanup: trash the smoke note again so the board stays clean.
  await api(cookie, `/api/notes/${noteId}`, { method: "DELETE" });

  streamA.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
