# SAA-96 — WebSocket presence + live board sync (Phase 2): Implementation Plan

- **Ticket:** [SAA-96] WebSocket presence + live board sync
- **Phase:** 2 (Phase 1 shipped 2026-07-27, ticket comment; browser-verified)
- **Status:** Ready for review
- **Decision log:** [artifacts/saa-96-decision-log.md](artifacts/saa-96-decision-log.md)
- **Repo:** `/home/dezignerdrugz/sticky-note-dashboard` @ `main` (6c518e2)

---

## 1. Source spec

Ticket SAA-96 (verbatim): _"No WebSocket server or client. `editingBy` hardcoded null. Warning UI in board-app never fires."_

Required events (ticket): `note.created`, `note.updated`, `note.moved`, `note.deleted`, `note.restored`, `presence.join`, `presence.leave`, `presence.editing`. Live board sync. Editing warning from presence — LWW (last-write-wins), **not CRDT**. Optional: updatedAt conflict toast (GAP-016).

Related gap-analysis entries (`GAP-ANALYSIS-v1.md`):
- **GAP-004** — "WebSocket presence and live board sync absent": lists `ws` unused in `package.json:29`, `editingBy: null` stub at `src/lib/notes.ts:27`, warning branch never firing at `src/components/board-app.tsx:148-151` (line numbers refer to the analysis-time snapshot; see §3 for current state).
- **GAP-016** — "Conflict detection via updatedAt unspecified in code": PATCH at `src/app/api/notes/[id]/route.ts` is a blind overwrite; desired state is a toast on version conflict detected via `updatedAt`.

Phase 1 shipped (2026-07-27): `updatedAt` on `serializeNote`/`CanvasNote`; poll `GET /api/notes` every 2.5 s plus refetch on `visibilitychange`; stale-aware merge (`mergeRemoteNotes`) with skip-overwrite for the dirty open note; peer-save warning in the editor. Phase 1 also shipped the **SSE presence layer** (see §3) — this plan extends it.

The investigation doc referenced by the ticket (`.scratch/investigate-realtime-sync.md`) does **not exist** in this repo (`.scratch/` is absent; it is gitignored via `.gitignore`, and no `git ls-files` match). The hosting-model TBD is resolved fresh in §4 using the shipped code and `node_modules/next/dist/docs/`.

---

## 2. Outcome + scope

### Delivers
1. Push-based live board sync: `note.created / updated / moved / deleted / restored` events fan out to every client viewing the same board in near-real time (< 1 s), replacing the 2.5 s polling timer.
2. Presence per the ticket's event set: `presence.join / leave / editing` plus the existing `presence.snapshot / idle`, with a server-side heartbeat/TTL so presence can never go zombie.
3. Editing warning from presence (already wired in Phase 1 client-side; kept and made robust).
4. Conflict detection on save (GAP-016): PATCH accepts `expectedUpdatedAt`; a stale save returns 409 and the client shows a toast.
5. A unified single SSE channel per board carrying both `note.*` and `presence.*` events (one connection, one reconnect story).
6. Removal of dead weight: `ws`/`@types/ws` (unused), `presence-hub.ts` + `/api/presence/stream` (superseded by the unified hub/stream).

### Non-goals
- **Not WebSocket** in the literal sense. Transport is SSE over a Next.js route handler (see Decision D1/D2 in the decision log). All ticket events are delivered.
- No CRDT / operational-transform merge. LWW per ticket.
- No horizontal scaling / Redis fan-out. Single self-hosted `next start` instance (see Decision D11; `self-hosting.md:93` documents this as the supported model).
- No board-level presence UI (e.g. "3 people viewing" chip) — the ticket's presence requirement is the **editing warning**; `join/leave` events are emitted and verifiable but not rendered.
- No TipTap/attachments, no pan/zoom, no mobile path (other gaps, not SAA-96).
- No test framework install (repo has none; verification is `npm run build` + dev-server/browser/smoke checks, per repo precedent).

---

## 3. Current-state map (grounded in code read at 6c518e2)

### Server-side presence (already shipped, working)
- `src/lib/presence-hub.ts` — in-memory `BoardRoom`s keyed by `boardId` (`getRoom`, `listEditors`, `broadcast`), stored on `globalThis.__stickyPresenceRoomsV2` (survives module reloads/HMR). Functions: `subscribePresence(boardId, userId, clientId, send)` returns `{ subId, snapshot: PresenceEditor[] }`; `unsubscribePresence` (clears that client's editor entry and broadcasts `presence.idle`; deletes the room when empty); `setEditing` (broadcasts `presence.idle` for the prior note, then `presence.editing`); `setIdle`. `PresenceEditor = { clientId, noteId, userId, userName }`.
- `src/app/api/presence/route.ts` — `POST /api/presence`; `requireApiUser()`; `resolveBoard(boardParam, user.id)`; private-board ownership check; validates `action` ∈ {editing, idle}, `noteId` required, `clientId` ≤ 80 chars; calls `setEditing`/`setIdle`. **Does not verify `noteId` belongs to the resolved board** (hardening item, Step 3).
- `src/app/api/presence/stream/route.ts` — `GET /api/presence/stream?board=&clientId=`; `runtime = "nodejs"`, `dynamic = "force-dynamic"`; `requireApiUser()`; SSE `ReadableStream` with `: keepalive` comment every 15 s; `presence.snapshot` sent on subscribe; cleanup on `request.signal` abort and stream `cancel()` (calls `unsubscribePresence` → broadcasts `presence.idle`). Connection == presence session.

### Client-side (already shipped, working)
- `src/components/board-app.tsx` (460 lines):
  - `POLL_MS = 2500`; polling effect at lines ~180-200 (`window.setInterval` → `syncNotes`; `visibilitychange` refetch). **The 2.5 s timer is what Phase 2 removes.**
  - `syncNotes()` fetches `/api/notes?board=` and applies `mergeRemoteNotes(prev, remote, dirtyNoteIdRef.current)`.
  - `mergeRemoteNotes` — LWW per-note: skips overwriting the dirty open note; otherwise keeps newer `updatedAt`.
  - SSE presence: `getPresenceClientId()` (sessionStorage key `sb-presence-client`), `postPresence(board, clientId, action, noteId)` (fetch POST, `keepalive` on idle), EventSource effect (~lines 200-280) subscribing to `presence.snapshot/editing/idle`, mapping to `editingByNoteId` via `mapFromEditors` (excludes self clientId so two tabs of the same user show "Another tab").
  - Actions: `createAt` (POST /api/notes, append + open), `moveNote` (optimistic `stampNow` then fetch PATCH `{x,y,zIndex}` — **no `response.ok` check, no rollback** (GAP-011)), `saveNote` (PATCH `{title,preview,color}`, applies server echo, updates `baselineUpdatedAt`), `deleteNote` (DELETE, removes locally, posts presence idle), `closeEditor` (posts presence idle).
  - Warnings: `peerEditor` (from `editingByNoteId`) → "`{name}` is also editing — last save wins"; `peerSavedWhileOpen` (`liveOpen.updatedAt > baselineUpdatedAt`) → "Someone else saved this note — last save wins". `editorWarning` passed to `<NoteEditor warning={...}>`.
  - `notesWithPresence` overlays `editingBy` from live presence onto each note; `sticky-note-card.tsx:82-86` renders the chip when `note.editingBy` is set. **The "warning never fires" ticket item is already resolved in Phase 1** (client-side; REST `serializeNote` still hardcodes `editingBy: null` at `src/lib/notes.ts:28`, which is fine — presence is out-of-band).
- `src/components/note-editor.tsx` — accepts `warning?: string | null`, renders a `⚠` banner (lines ~301-307); 700 ms autosave debounce; `flushAndClose`; **does not flush pending draft on unexpected unmount** (cleanup only clears the timer — GAP-010, out of scope, noted).

### Mutation points (where `note.*` broadcasts are added)
- `src/app/api/notes/route.ts` — `GET` (list for initial/backstop loads), `POST` (create, returns `serializeNote(note)`).
- `src/app/api/notes/[id]/route.ts` — `PATCH` (body fields: `title, preview, color, x, y, width, height, zIndex, rotation`; blind overwrite; returns `serializeNote(note)` with `preview` echoed from the request); `DELETE` (soft delete via `deletedAt`, returns serialized note).
- `src/app/trash/actions.ts` — `restoreNote(noteId)` server action: authz via `requireUser()` + board ownership; sets `deletedAt: null`; `revalidatePath("/trash")` + `("/")`. `purgeNote` (admin, hard delete — **no broadcast needed**: purged notes are not on any board).

### Auth/session
- `src/lib/auth.ts` — better-auth (email/password), `trustedOrigins` from `BETTER_AUTH_URL`/`APP_URL`. Session cookie = `better-auth.session_token...` (better-auth `cookies/index.mjs:26,47` — prefix `better-auth`, cookie `session_token`).
- `src/lib/session.ts` — `getSession()` = `auth.api.getSession({ headers: await headers() })`; `requireApiUser()` returns `{ user }` or a 401 `NextResponse`; `requireUser()` redirects; both check `user.active`.
- `src/lib/notes.ts` — `serializeNote(note)`, `resolveBoard(boardParam, userId)` (private→`getOrCreatePrivateBoard`, else company board), `previewFromBody`, `bodyFromPreview`.
- `src/lib/prisma.ts` — single PrismaClient on `globalThis` (same pattern the hub uses).

### Config / deployment
- `package.json` — scripts `dev` (`next dev`), `build` (`prisma generate && next build`), `start` (`next start`); deps include `ws@^8.21.1` + devDeps `@types/ws@^8.18.1` — **imported nowhere** (verified: zero matches for `from "ws"` / `require("ws")` under `src/`, `scripts/`, `prisma/`).
- `Dockerfile` — **not standalone output**: builder copies `.next` + full `node_modules`, runner runs `npx prisma migrate deploy && node scripts/bootstrap.mjs && npm run start` (`next start`). Node 22-alpine.
- `docker-compose.yml` — single `app` service on :3000, Postgres 16 sidecar, uploads volume.
- `next.config.ts` — `devIndicators: false` only.
- `.gitignore` — ignores `.scratch/`, `GAP-ANALYSIS-v1.md`, `security-analysis.md`, `.agents/` etc. `docs/plans/` is **not** ignored (will be committed).

### Next.js 16 docs read (authoritative, cited)
| Doc (under `node_modules/next/dist/docs/`) | Finding used |
|---|---|
| `01-app/02-guides/custom-server.md` | Custom server = `createServer` + `next()` + `getRequestHandler`, run via `node server.js` replacing `next start`; "should only be used when the integrated router of Next.js can't meet your app requirements"; custom-server files are **not traced by standalone output** ("These cannot be used together"). No WebSocket API is offered by the integrated server. |
| `01-app/02-guides/backend-for-frontend.md` (line ~927) | On hosts that deploy Route Handlers as lambdas: "WebSockets won't work because the connection closes on timeout, or after the response is generated." Route handlers are **not** a WebSocket surface in Next 16. |
| `01-app/03-api-reference/03-file-conventions/route.md` (§Streaming, lines ~367-479) | Streaming responses via `new Response(stream)` on a `ReadableStream` are the documented long-lived-push pattern for Route Handlers → SSE is a first-class supported mechanism. |
| `01-app/02-guides/self-hosting.md` (lines ~93, 265, 297) | Single self-hosted `next start` instance with persistent disk is the supported deployment model; streaming responses require load balancers/proxies to allow chunked transfer / HTTP/2 streaming (`X-Accel-Buffering: no` + `Cache-Control: no-transform` already used by the shipped stream). |
| `01-app/03-api-reference/03-file-conventions/proxy.md` | `proxy.ts` is for request-time transforms; not a connection surface (rule out). |

---

## 4. Architecture decision with evidence

### 4.1 Transport: SSE (not WebSocket)
Server → client push for both `note.*` and `presence.*` over **one SSE stream per board** (`GET /api/realtime/stream?board=&clientId=`). Client → server stays on the existing REST paths (`POST/PATCH/DELETE /api/notes…`, `POST /api/presence`, trash server action). Rationale and citations in Decisions D1/D2 of the decision log; summarized:

- Next 16 route handlers support streaming (`route.md` §Streaming) but have **no** WebSocket upgrade surface (`backend-for-frontend.md` line ~927; nothing in the App Router exposes `upgrade`). Literal WebSocket requires ejecting to a custom server (`custom-server.md`), which changes `dev`/`start` scripts and the Dockerfile CMD, and is explicitly discouraged ("only when the integrated router… can't meet your app requirements").
- The repo already ships a working SSE presence pipeline (`presence-hub.ts`, `/api/presence/stream`, EventSource in `board-app.tsx`) that Phase 1 browser-verified. Extending the proven surface is lower-risk than ejecting.
- The workload is one-way push with REST writes; a bidirectional socket buys nothing.
- SSE payload format already exists (`encodeSse`, `: keepalive` comments) and survives Docker/lb proxy via the header set in the shipped stream.

### 4.2 Server hosting: Next route handlers (nodejs runtime), no custom server, no extra process
`runtime = "nodejs"` + `dynamic = "force-dynamic"` (existing pattern in `api/presence/stream/route.ts`). Works unchanged under `next dev`, `next start`, and the existing Dockerfile/Compose. Rejected: custom server (docs + Docker churn, standalone-trace caveat, no requirement), separate process (new deploy unit, cookie/auth complexity, no requirement). See Decision D2.

### 4.3 Unified channel + room model
One hub module `src/lib/realtime-hub.ts` replaces `presence-hub.ts`. Rooms keyed by **`boardId`**:

```ts
type Room = {
  byClientId: Map<string, PresenceEntry>; // one editor per tab
  subscribers: Map<string, Subscriber>;   // one per open SSE connection
  noteSubscribers: Map<string, Subscriber>; // same set — see 4.4
  lastSeenAt: number;
};
```

Every subscriber belongs to exactly one room. Board authz happens **before** subscription: `requireApiUser()` (session cookie via better-auth, `src/lib/session.ts:getSession`), then `resolveBoard(boardParam, user.id)`, then private-board ownership check (`board.type === "private" && board.ownerUserId !== user.id` → 403) — the exact gate the notes API and presence stream already use. A client can only subscribe to a board it can read, and the server derives all broadcast content from **post-auth, post-write Prisma results** — clients never relay note payloads, so there is no spoofing surface.

### 4.4 Message schema (shared types in `src/lib/realtime-types.ts`)

```ts
type ServerEvent =
  // note.* events are broadcast by the server after a committed DB write
  | { event: "note.created";  data: { boardId: string; note: SerializedNote } }
  | { event: "note.updated";  data: { boardId: string; note: SerializedNote } } // content save
  | { event: "note.moved";    data: { boardId: string; note: SerializedNote } } // x/y/zIndex PATCH
  | { event: "note.deleted";  data: { boardId: string; noteId: string } }
  | { event: "note.restored"; data: { boardId: string; note: SerializedNote } } // trash restore
  // presence.*
  | { event: "presence.snapshot"; data: { editors: PresenceEditor[] } } // on (re)connect
  | { event: "presence.join";  data: { clientId: string; userId: string; userName: string } }
  | { event: "presence.leave"; data: { clientId: string; userId: string; userName: string } } // disconnect or TTL
  | { event: "presence.editing"; data: PresenceEditor } // opened note N
  | { event: "presence.idle";    data: { noteId: string; userId: string; clientId: string } };
```

Serialization is `serializeNote(note)` from `src/lib/notes.ts` (already includes `updatedAt` ISO). `note.moved` vs `note.updated` is discriminated server-side: PATCH with any of `x`/`y`/`zIndex` present → `note.moved`, else `note.updated` (matches the two client call sites `moveNote` and `saveNote`). Clients treat both identically (LWW merge).

**`note.snapshot`**: on every (re)subscription the server sends `{ event: "note.snapshot", data: { notes: SerializedNote[] } }` (the same query as `GET /api/notes`) **instead of** a separate refetch. This is what makes reconnect self-healing and lets Phase 2 delete the 2.5 s poll (Decision D4/D9).

### 4.5 Connection lifecycle + presence model
- **Connect:** GET stream → auth → board authz → `subscribeRealtime` → enqueue `presence.snapshot` (editors) + `note.snapshot` (notes) → start 15 s comment keepalive.
- **Editing:** client `openNote`/close posts `POST /api/presence {action:"editing"|"idle"}` (existing flow); hub broadcasts `presence.editing`/`presence.idle`. `setEditing` keeps the "prior note of this clientId → idle" transition (existing behavior).
- **Heartbeat/TTL:** presence entries gain `lastSeenAt`, refreshed on subscribe and on every `presence.editing` POST. A hub sweep (30 s interval) evicts entries older than 90 s and broadcasts `presence.leave`. Client refreshes while a note is open: `setInterval` 45 s → `postPresence("editing", noteId)` (idempotent, tiny). This closes the zombie-presence gap that pure connection-abort cleanup leaves (blackholed sockets linger until TCP timeout).
- **Disconnect:** stream `abort`/`cancel` → `unsubscribeRealtime` → delete that client's editor entry → broadcast `presence.leave` (also covers hard tab kills via socket close) → delete room when empty (existing GC).
- **join/leave:** emitted explicitly on subscribe/unsubscribe (data above) so the ticket's full event set is observable (smoke script asserts them).

### 4.6 LWW semantics + authoritative broadcast
- Server is the source of truth: every mutation route broadcasts **after** the Prisma write, with the freshly serialized note (server `updatedAt`). Move/create/delete already return the authoritative note to the acting client; peers now get it pushed.
- Client applies remote notes with the existing `mergeRemoteNotes` LWW rule: **skip-overwrite while the user is actively editing that note** (dirty guard), otherwise newer `updatedAt` wins. Applied to pushed events per-note and to `note.snapshot` wholesale (idempotent — existing merge handles dedupe by id).
- `note.created`/`note.restored`: insert if `id` not already present (guards double-apply from optimistic local adds + echo).
- Because the acting client's own write comes back as an event echo, the LWW compare is a no-op for it (equal/older local timestamps), so no flicker.

### 4.7 Reconnection strategy + poll fate
- **Poll: removed as a fixed timer** (`POLL_MS` interval deleted). Kept as backstops: `visibilitychange` refetch (exists) and **stream reconnect healing** — EventSource auto-reconnects (native), and the server re-sends `presence.snapshot` + `note.snapshot` on every subscription, so any events missed while disconnected are reconciled by the snapshot merge. A reconnected stream also re-arms the TTL sweep (no client code needed).
- Rationale: SSE keepalives detect half-open connections; EventSource reconnects with backoff; the snapshot-on-subscribe makes refetch-on-reopen redundant; dropping the timer removes steady `/api/notes` load per tab (was every 2.5 s).
- Decision D4 records the alternative (60 s poll backstop) and why it was rejected (redundant with reconnect snapshot + visibilitychange; constant load; complexity).

### 4.8 Conflict toast (GAP-016)
`saveNote` sends `expectedUpdatedAt: baselineUpdatedAt` with PATCH. Server compares against `existing.updatedAt`; if the DB is newer → **409** `{ error: "conflict", note: serializeNote(note) }`, no write. Client on 409: keep the draft open, show a toast ("This note was updated by someone else — last save wins"), refresh `baselineUpdatedAt` + local note from the returned server note, do **not** auto-retry (LWW: the peer's save is the winner; the user re-saves consciously to overwrite). Decided-included (cheap on Phase 2 infra; closes GAP-016; see Decision D10).

---

## 5. File-by-file change list

### New files
| Path | Contents (planning altitude) |
|---|---|
| `src/lib/realtime-types.ts` | Shared `ServerEvent` union (4.4), `PresenceEditor`, `PresenceEntry`; no imports from hub (avoid cycles). |
| `src/lib/realtime-hub.ts` | Replaces `presence-hub.ts`: same `globalThis` room-store pattern (`__stickyRealtimeRoomsV2`); `subscribeRealtime(boardId, userId, clientId, send)` → `{ subId, snapshot: { editors, notes? } }`; `unsubscribeRealtime`; `setEditing`/`setIdle` (ported); `broadcastNote(boardId, event)`; presence TTL sweep + `join`/`leave` emission; empty-room GC. |
| `src/app/api/realtime/stream/route.ts` | `GET` SSE stream (port of `api/presence/stream/route.ts`): auth, board authz, subscribe, initial `presence.snapshot` + `note.snapshot`, 15 s keepalive, abort/cancel cleanup → `unsubscribeRealtime`. `runtime = "nodejs"`, `dynamic = "force-dynamic"`. |
| `scripts/realtime-smoke.mjs` | Throwaway verification client (§7): signs in via `POST /api/auth/sign-in/email` (captures `Set-Cookie`), opens the SSE stream with `fetch()` + `ReadableStream` reader (Node ≥ 22, zero deps), prints event timeline; drives `POST /api/notes`, `PATCH/DELETE /api/notes/:id`, `POST /api/presence` to provoke broadcasts. Mirrors `scripts/bootstrap.mjs` precedent (plain Node script in `scripts/`). |
| `docs/plans/artifacts/saa-96-decision-log.md` | This plan's decision log. |

### Modified files
| Path | Touched symbols / behavior |
|---|---|
| `src/components/board-app.tsx` | EventSource URL → `/api/realtime/stream`; add note event handlers (`onCreated`/`onUpdated`/`onMoved`/`onDeleted`/`onRestored`/`onSnapshot`) applying LWW merge / insert-dedupe / remove; delete `POLL_MS` + polling effect; keep `visibilitychange` refetch; add 45 s editing-heartbeat interval while `openState` (posts `postPresence("editing", openId)`); `moveNote`: check `response.ok`, revert optimistic position + refetch on failure (fixes GAP-011 desync); `saveNote`: send `expectedUpdatedAt`, handle 409 → toast + baseline refresh; remove `source.addEventListener` blocks for presence events that moved to the unified handler switch; keep `postPresence`/`mapFromEditors`/`peerLabel`/`mergeRemoteNotes`. |
| `src/components/note-editor.tsx` | (GAP-016) optional `conflict`/toast state: reuse existing `warning` surface or a small dismissible banner; no behavior change otherwise. |
| `src/app/api/notes/route.ts` | `POST`: after `prisma.note.create` → `broadcastNote(board.id, { event: "note.created", boardId, note: serializeNote(note) })`. |
| `src/app/api/notes/[id]/route.ts` | `PATCH`: compute `isMove = x|y|zIndex in body`; after `prisma.note.update` → `broadcastNote(board.id, note.moved | note.updated)`; GAP-016: `expectedUpdatedAt` in body → 409 path. `DELETE`: after soft delete → `broadcastNote(board.id, { event: "note.deleted", boardId, noteId })`. |
| `src/app/trash/actions.ts` | `restoreNote`: after update → `broadcastNote(note.board.id, { event: "note.restored", boardId, note: serializeNote(updatedNote) })`. (`purgeNote`: unchanged — no board event.) |
| `src/app/api/presence/route.ts` | Import `setEditing`/`setIdle` from `realtime-hub`; add ownership check: fetched note must have `note.boardId === board.id` else 400/403 (prevents cross-board noteId claims). |
| `package.json` | Remove `ws` and `@types/ws` (proven unused). |
| `README.md` | "What's in v1": polling → live board sync (SSE push) + real-time presence; drop "Push-based live board sync" from "Still coming". |

### Deleted files
- `src/lib/presence-hub.ts` (superseded by `realtime-hub.ts`)
- `src/app/api/presence/stream/route.ts` (superseded by `/api/realtime/stream`)

---

## 6. Decomposition + sequencing (each step independently verifiable)

> Environment for verification: `docker compose up db -d` (Postgres on :5433), `.env` present, `npm install`, `npx prisma migrate deploy`, `npm run bootstrap`; dev server via `npm run dev`. Follow repo precedent: no test framework, verification = build + dev-server/browser/smoke.

**Step 0 — Unify the realtime layer (no behavior change).**
Create `realtime-types.ts`, `realtime-hub.ts` (port presence functions + note broadcast plumbing + `note.snapshot`), `api/realtime/stream/route.ts`. Point `api/presence/route.ts` at the new hub. Point `board-app.tsx`'s EventSource at `/api/realtime/stream`, keeping only snapshot/editing/idle handlers (note-handler switch added as no-op). Delete old `presence-hub.ts` + `presence/stream/route.ts`.
- Verify: `npm run build` passes; two-tab presence check still works (tab A opens note → tab B chip + warning; close → clears, same as Phase 1 acceptance).

**Step 1 — Server fan-out of `note.*` events.**
Broadcasts in `api/notes/route.ts` (POST), `api/notes/[id]/route.ts` (PATCH/DELETE), `trash/actions.ts` (`restoreNote`).
- Verify: `npm run build`; `node scripts/realtime-smoke.mjs` with two SSE identities: create/PATCH-position/PATCH-content/DELETE/restore from identity 1 → identity 2 observes `note.created / note.moved / note.updated / note.deleted / note.restored` (assert event names + `boardId` + `updatedAt` present). This proves server fan-out without a browser.

**Step 2 — Client live sync + poll removal.**
`board-app.tsx`: real note-event handlers (dedupe insert, LWW per-note merge, delete, restore), delete `POLL_MS` timer, keep `visibilitychange` refetch, `moveNote` rollback fix.
- Verify: `npm run build`; browser-verify with two tabs (§7 item 2): create/edit/move/delete/restore in tab A → tab B updates **without refresh and under ~1 s**; dirty-open-note guard still holds (start editing in B, save in A → B's in-flight draft not clobbered and warning appears); **poll gone**: DevTools Network shows no repeating `GET /api/notes` while idle, only the stream.

**Step 3 — Presence hardening: TTL, heartbeat, join/leave, noteId authz.**
Hub TTL sweep + `lastSeenAt`; client 45 s heartbeat; `presence.join/leave` emission; ownership check in `api/presence/route.ts`.
- Verify: smoke script — client 2 connects → client 1 sees `presence.join`; client 2 disconnects (stream close, no idle POST) → client 1 sees `presence.leave` promptly (abort path) ; blackhole simulation: client 2 stays connected but stops heartbeating (script flag) → `presence.leave` within TTL window (90 s); `POST /api/presence` with a noteId from another board → 400/403.

**Step 4 — GAP-016 conflict toast.**
PATCH `expectedUpdatedAt` + 409; `saveNote` handling + toast in `note-editor.tsx`.
- Verify: two tabs open the same note; B saves; A edits and saves → A sees toast, no DB clobber (fields A didn't touch retain B's values — inspect via `GET /api/notes`); A re-saves to win (LWW) → B's tab shows it via stream.

**Step 5 — Cleanup + docs.**
Remove `ws`/`@types/ws` from `package.json` (`npm install` to sync the lockfile); update `README.md`; keep `scripts/realtime-smoke.mjs` (dev aid, mirrors `scripts/bootstrap.mjs` precedent) or delete it after the DoD run per Maintainer preference.
- Verify: `npm run build`; `grep -rn "from \"ws\"" src scripts` → empty; full DoD acceptance run (§9).

---

## 7. Testing strategy

No test runner exists and none is added (repo precedent; Decision D12). Each Step's verify action is a scoped runtime check:

1. **What each step proves**: Step 1 = server-side event contract (names, payload shape, authz boundary, fan-out to all subscribers in the room, isolation between rooms); Step 2 = client reconciliation rules (LWW, dirty-guard, dedupe, delete/restore) and poll removal; Step 3 = presence lifecycle (join/leave/editing, TTL eviction, cross-board noteId rejection); Step 4 = conflict semantics (409, no partial clobber, toast UX).
2. **Presence join/leave/editing end-to-end** (browser, two tabs, one user): open note in tab A → within ~1 s tab B's note card shows the peer chip; open the same note in tab B → both editors show the ⚠ "is also editing — last save wins" banner; close tab A or the editor → chip/banner clears (idle POST + abort path); the same flow with two different users shows the user's name; two tabs of one user show "Another tab".
3. **Live sync end-to-end** (browser, two tabs): the full create/edit/move/delete/restore loop propagates sub-second without refresh; an offline interlude (DevTools → Network → Offline for ~10 s, then Online) reconciles via reconnect snapshot + visibilitychange refetch.
4. **Smoke script** (`scripts/realtime-smoke.mjs`) provides the transport-level proof for Steps 1/3 (event timeline assertions in Node, no browser flakiness) and doubles as a manual regression aid.

---

## 8. Risks + mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Auth bypass on the stream** | Same gate as every protected route: `requireApiUser()` (session cookie via better-auth) + `resolveBoard` + private-ownership check, all **before** subscription. EventSource is same-origin → cookies sent automatically; no token in URL (`clientId` only, generated client-side, ≤ 80 chars). |
| R2 | **Message spoofing / size bombs** | Clients never send `note.*` events — the server is the only broadcaster, and payloads come from post-write Prisma results (`serializeNote`). Client→server channels are existing validated REST routes (presence POST validates action/noteId/clientId lengths; add noteId-ownership check, Step 3). Server→client payload caps: a note serialization is small; snapshot size bounded by board size (internal-team scale, per CONTEXT.md). No WebSocket frame layer to abuse. |
| R3 | **Reconnect storms** | EventSource's native retry with backoff; on reconnect the server only sends snapshot + presence.snapshot (no per-event replay); snapshot merge is idempotent. No client retry loops added. |
| R4 | **Memory leaks (disconnected sockets)** | Strict lifecycle: `request.signal` abort + `cancel()` → `unsubscribeRealtime` removes subscriber + presence entry + broadcasts leave; rooms GC'd when empty (existing pattern); TTL sweep evicts blackholed presence; keepalives detect half-open sockets. Hub state is in-memory per process (single `next start` instance — Documented limitation D11). |
| R5 | **Stale-client races (LWW clobber)** | Existing dirty-guard (don't overwrite the note being edited) + server-timestamp LWW + reconnect snapshot + visibilitychange refetch. Residual LWW overwrite risk is inherent and ticket-accepted ("LWW, not CRDT"); GAP-016 409 reduces the surprise for the open-editor case; GAP-011 fix (step 2) removes the optimistic-move desync. |
| R6 | **Zombie presence after silent disconnect** | TTL sweep (90 s) + client heartbeat (45 s); connection-abort path covers the common case. |
| R7 | **Docker / Next 16 constraints** | No Dockerfile/Compose change (SSE works under `next start`); route handlers already use the required `runtime = "nodejs"` + `dynamic = "force-dynamic"`; stream headers already include `X-Accel-Buffering: no` + `Cache-Control: no-cache, no-transform` (self-hosting.md streaming note). If a reverse proxy sits in front, document `proxy_buffering off` for `/api/realtime/stream`. |
| R8 | **Dev-mode HMR killing the hub** | Same `globalThis` store pattern as `prisma.ts`/presence-hub (`__stickyRealtimeRoomsV2`), so rooms survive HMR across route modules (proven by the shipped presence layer). |
| R9 | **Multi-instance scale** | Explicitly out of scope (Decision D11): in-memory rooms + single-instance Docker model. If ever needed: Redis pub/sub behind the hub interface (`broadcastNote`/`subscribeRealtime` are the only seams). |

---

## 9. Definition of done (observable, against the ticket's event list)

1. **`note.created`**: creating a note in tab A appears on tab B's board in < 1 s without refresh, in the right position with title/color.
2. **`note.updated`**: editing title/body/color in tab A is reflected on tab B in < 1 s (LWW merge; dirty-open-note in B is not clobbered).
3. **`note.moved`**: dragging in tab A repositions the note on tab B in < 1 s.
4. **`note.deleted`**: trashing in tab A removes the note from tab B's board (canvas + list) in < 1 s; if tab B has it open, the editor closes.
5. **`note.restored`**: restoring from /trash in one tab brings the note back on another tab's open board in < 1 s.
6. **`presence.join` / `presence.leave`**: connecting a second client emits join observed by the first; closing that client (tab close, navigation, or network blackhole > TTL) emits leave; both observable in the smoke script timeline and, for the editor case, via the chip/banner clearing.
7. **`presence.editing`**: opening a note in tab A shows tab B's card chip ("Another tab" for same user / name for other) and the editor ⚠ warning in ~1 s; closing clears it.
8. **Poll removed**: no repeating `GET /api/notes` on an idle tab (Network panel); server logs show only the stream connection.
9. **Reconnect**: an offline/online cycle reconciles all missed changes via reconnect snapshot (no refresh, no data loss).
10. **GAP-016**: a stale save (peer wrote while I edited) shows the conflict toast, returns 409, and does not silently clobber the peer's fields.
11. **Clean cutover**: `npm run build` green; `ws`/`@types/ws` gone from `package.json`; `grep -rn "presence-hub\|api/presence/stream" src` → no matches; `README.md` updated.

---

## 10. Open questions for the user

1. **WebSocket vs SSE**: the ticket's literal wording says "WebSocket", but the Next 16 docs (cited §3-4, D1/D2) plus the shipped SSE presence layer make route-handler **SSE** the evidence-backed choice; all ticket events and acceptance criteria are met under SSE. If the team truly requires a byte-level WebSocket, the custom-server path is documented in the decision log (D2, rejected alternative) — it costs script/Dockerfile/`server.ts` changes and re-implementation of the shipped presence pipeline.
2. **GAP-016 (conflict toast)**: decided **include** (cheap on Phase 2 infra, named in the ticket). Confirm if the team wants it deferred.
3. **`presence.join/leave` UI**: decided **no new UI** beyond the existing editing chip/warning; join/leave are emitted and asserted by the smoke script. Confirm if a board-level "N viewing" chip is wanted.
4. **`ws` removal**: decided remove (proven unused). Confirm if any external tooling depends on the package being present.
5. **Snapshot-on-connect**: decided the stream sends `note.snapshot` on every subscribe (single source of truth for reconnect); this duplicates the `GET /api/notes` payload per connect. Confirm acceptable for board size (internal team).
