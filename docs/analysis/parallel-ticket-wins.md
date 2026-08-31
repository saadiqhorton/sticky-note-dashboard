# Stickyboard — Parallel Ticket Wins Analysis

**Generated:** 2026-08-30 · Read-only analysis of 15 open Linear tickets (SAA-92…SAA-107).
**Source of truth:** Linear ticket bodies + the actual repo (`src/`, `prisma/`, Docker files) — every claim cites a file. No test runner exists, so verification for every ticket below is `npm run build` + dev-server smoke + browser check (no test files found: glob for `**/*.{test,spec}.{ts,tsx,js,mjs}` returns nothing).

---

## TL;DR

| Batch | Tickets | Why |
|---|---|---|
| **1 — start NOW** (low complexity, zero overlap with SAA-96's files) | SAA-101, SAA-102 (hide-only), SAA-103, SAA-104, SAA-100, SAA-107 (non-board-app parts) | Each touches 1–2 files, all disjoint from each other and from SAA-96's surface |
| **2 — after SAA-96 lands** (same files as in-flight SAA-96) | SAA-92, SAA-93, SAA-99, SAA-105, SAA-106, SAA-107 (board-app parts) | All touch `board-app.tsx`, `note-editor.tsx`, or `api/notes/*` — SAA-96's surface |
| **3 — later** (big features; serialize carefully) | SAA-95, SAA-97, SAA-98, SAA-102 (implement-variant) | TipTap rewrites the editor + data contract; attachments then build on it; pan/zoom is the only medium-complexity non-overlapping item |

**Hard rule from the constraint:** any ticket touching `board-app.tsx`, `note-editor.tsx`, `src/lib/auth*`, `api/notes` routes, or the future WebSocket entry must NOT run concurrently with SAA-96 implementation. SAA-96's Phase 1 already shipped (2.5s polling, SSE presence, peer-save warning — see ticket comment 2026-07-27), Phase 2 (WS push + presence, hosting model TBD) is the in-flight work. The planner agent for it was hard-aborted mid-investigation (no plan file landed), so the surface should be treated as still owned by SAA-96.

---

## Per-ticket rundown

| ID | Plain English | Complexity | Files touched | SAA-96 overlap |
|---|---|---|---|---|
| **SAA-92** | Autosave flushes on the Back button but not on an unexpected unmount — edits can vanish if the editor is ripped away mid-typing | **S** | `note-editor.tsx` (unmount effect, ~line 209–214) | ⚠ YES — note-editor is SAA-96 surface |
| **SAA-93** | Dragging a note updates the UI immediately but the server save isn't checked — on failure UI and DB desync | **S–M** | `board-app.tsx` (`moveNote`, ~line 333) | ⚠ YES — board-app |
| **SAA-95** | Note body is a plain textarea storing plain text; make it rich text (bold/links/checklists) storing structured JSON | **L** | `note-editor.tsx`, `lib/notes.ts`, `api/notes/route.ts`, `api/notes/[id]/route.ts`, list/card preview paths | ⚠ YES — editor + api/notes |
| **SAA-96** | Real-time collaboration: push note changes + presence over WebSocket instead of polling; in flight now | **L** | `board-app.tsx`, `note-editor.tsx`, `lib/auth*`/`session.ts`, `api/notes/*`, `api/presence/*`, `presence-hub.ts`, new `server/ws` entry, Dockerfiles (hosting model TBD) | — (the surface) |
| **SAA-97** | Attach files to notes (upload/download), and actually delete files from disk when an admin purges | **M–L** | new `api/attachments/*`, `note-editor.tsx` (UI), `trash/actions.ts` (purge), `UPLOAD_DIR` fs | ⚠ partial — editor UI part |
| **SAA-98** | Board is fixed to the window; make it a large pannable/zoomable surface | **M** | `board-canvas.tsx`, `lib/note-bounds.ts` | ✊ none — but not low-complexity |
| **SAA-99** | On phones default to the list view (canvas default now), keep editor full-screen | **S–M** | `board-app.tsx` (view default), `notes-list.tsx` | ⚠ YES — board-app |
| **SAA-100** | Docker builds don't bake in `NEXT_PUBLIC_APP_URL`, so client-side auth can point at the wrong origin | **S–M** | `Dockerfile`, `docker-compose.yml`, `.env.example` | 🔶 low — only if SAA-96 changes the Docker CMD |
| **SAA-101** | Show "updated at" in the list view | **S** | `notes-list.tsx` only | ✅ none |
| **SAA-102** | Right-click menu has two greyed-out items (Paste, Zoom to fit) — make them work or stop showing them | **S** (hide) / M (implement) | `board-canvas.tsx` (menu, ~line 308–315) | ✅ none (✊ same file as SAA-98) |
| **SAA-103** | The paper-corner flap on drag is static; make it peel dynamically | **S** | `sticky-note-card.tsx` (flap span, ~line 68–75) | ✅ none (⚠ only if it needs overlap data → board-canvas) |
| **SAA-104** | Dev overlay hydration mismatch in the header bar | **S–M** | `board-chrome.tsx` | ✅ none if self-contained |
| **SAA-105** | API accepts negative/crazy width/height/zIndex/rotation — clamp + validate server-side | **S** | `api/notes/[id]/route.ts` (PATCH) | ⚠ YES — api/notes (also shared with SAA-106) |
| **SAA-106** | When someone else's save overwrites yours, show a "last save wins" toast | **S–M** | `api/notes/[id]/route.ts` (lock), `board-app.tsx` (toast) | ⚠ YES — both files (detection UI already shipped in Phase 1) |
| **SAA-107** | Cleanup grab-bag: double-fetch on load, unused prop, Trash back-link URL, unused npm package, README sync | **S each, L total** | `board-app.tsx`, `page.tsx`, `trash/page.tsx`, `package.json`, `README.md` | ⚠ partial — the board-app/page.tsx chunks |

---

## Evidence per ticket (files read)

- **SAA-92** — `note-editor.tsx`: the normal close path flushes (`flushAndClose()` → `persist()`, lines ~190–208), but the mount-cleanup effect (lines ~209–214) only clears `saveTimerRef`, never calls `persist()` — matches GAP-010 exactly ("cleanup at 209–214 only clears timer"). Fix is a few lines: call `persist()` (or `fetch(..., keepalive)`) on unmount when dirty.
- **SAA-93** — `board-app.tsx` `moveNote`: `setNotes` optimistic update, then `await fetch(PATCH)` with **no** `response.ok` check and no rollback — compare `saveNote`, which does check `.ok` and replaces with the server's note. GAP-011.
- **SAA-95** — `package.json` has all `@tiptap/*` deps (react, starter-kit, link, placeholder, task-list, task-item); grep shows zero imports in `src/`; `note-editor.tsx` still uses a plain `<textarea>`; `lib/notes.ts` `bodyFromPreview` returns `{ text }` (not TipTap doc JSON) and `previewFromBody` reads `.text`; PATCH in `api/notes/[id]/route.ts` accepts a `preview` string. GAP-002 + GAP-014 (data-contract divergence — no DB migration needed since `bodyJson` is already `Json`, but existing `{text}` docs need a compat read path).
- **SAA-96** — grep finds **no** WebSocket usage anywhere in `src/`; `ws@8.21.1` + `@types/ws` already in `package.json` (unused); no `server/` dir exists; presence today is SSE (`EventSource` → `/api/presence/stream`, `presence-hub.ts` with in-memory rooms). Phase 1 shipped per ticket comment (poll 2.5s + visibilitychange refetch, `mergeRemoteNotes`, `updatedAt` on `serializeNote`, peer-save warning in editor — all visible in `board-app.tsx`/`note-editor.tsx`/`lib/notes.ts`). Phase 2 = WS push + presence; hosting model TBD (Next 16 custom server vs route-based upgrade — the aborted planner had pulled `docs/01-app/02-guides/custom-server.md` and `self-hosting.md` but left no decision). If a custom server lands, `Dockerfile` CMD (`npm run start`) and compose change too.
- **SAA-97** — `prisma/schema.prisma` has the `Attachment` model (noteId, filename, mimeType, sizeBytes, storagePath); `UPLOAD_DIR` exists in `.env.example`, compose passes `UPLOAD_DIR: /data/uploads`, Dockerfile creates/chowns `/data/uploads`. But: no upload/serve route exists (api dir has auth/presence/notes/invites only), no editor UI, and `trash/actions.ts` `purgeNote` deletes only the note row (no file cleanup). GAP-003.
- **SAA-98** — `board-canvas.tsx`: fixed viewport surface (`min-h-[calc(100vh-4.5rem)] overflow-hidden`), `canvasPoint`/`clampForNote` use viewport rect (no transform); `lib/note-bounds.ts` header comment: "Soft server-side ceiling until pan/zoom adds a real canvas size" (client clamps to viewport, server to 5000×5000). GAP-005/009.
- **SAA-99** — `board-app.tsx` line ~100: `view = searchParams.get("view") === "list" ? "list" : "canvas"` — canvas default; grep finds **zero** `matchMedia` anywhere in the repo. GAP-008. (Note: the editor is already a fixed full-screen overlay, so the "full-screen on mobile" half is largely done.)
- **SAA-100** — `src/lib/auth-client.ts`: `createAuthClient({ baseURL: process.env.NEXT_PUBLIC_APP_URL })` — this is inlined at **build** time; `Dockerfile` has no `NEXT_PUBLIC_APP_URL` ARG/ENV during the builder stage, and `docker-compose.yml`'s app environment doesn't pass one (only `BETTER_AUTH_URL`/`APP_URL`). So in the container the client is built with `undefined`.
- **SAA-101** — `notes-list.tsx` rows render color swatch + title + preview only (lines ~30–53). `CanvasNote` already has `updatedAt` and `serializeNote` already emits it (`lib/notes.ts`) — GAP-007's "serializeNote omits updatedAt" is stale since Phase 1. So this is a pure render addition in one file.
- **SAA-102** — `board-canvas.tsx` empty-canvas menu: "Paste" and "Zoom to fit" buttons hardcoded `disabled` (lines ~308–315). GAP-006.
- **SAA-103** — `sticky-note-card.tsx`: corner "flap" is a static rotated square rendered only while `dragging || selected` (lines ~68–75); no overlap-aware peel. GAP-015; README "Still coming — Stronger paper-flap motion polish".
- **SAA-104** — `board-chrome.tsx` calls `usePathname`/`useSearchParams` and derives `view`/`board` unconditionally; the Suspense boundary exists only around `BoardAppInner` (`board-app.tsx` bottom) — `BoardChrome` is outside it, the known SSR-prerender-vs-client searchParams mismatch shape.
- **SAA-105** — `api/notes/[id]/route.ts` PATCH: `width/height/zIndex/rotation` pass straight through (`nextWidth = body.width ?? existing.width` … `zIndex: body.zIndex ?? existing.zIndex`, `rotation: body.rotation ?? existing.rotation`); only `x/y` are clamped. `zod` is already a dependency (unused for this).
- **SAA-106** — Phase 1 already gives stale-aware merge + in-editor warnings ("Someone else saved this note — last save wins" in `board-app.tsx` `editorWarning`). Missing: a PATCH-side version guard (blind overwrite today) and/or an actual toast. GAP-016; ticket marks it as depending on WebSocket/realtime.
- **SAA-107** — `board-app.tsx`: mount effect calls `syncNotes` right after seeding `initialNotes` (double fetch); `BoardAppProps.initialBoard` is passed from `page.tsx` but never destructured in `BoardAppInner`; `trash/page.tsx` line ~41 back link is `href="/"` (ticket wants `/?board=team`); `package.json` has `next-themes` with zero matches repo-wide; README "What's in v1" is already accurate (polling + SSE listed), "Still coming" mirrors the open feature tickets.

---

## File-overlap matrix (tickets × key files)

```
                    board-  note-   board-  board-  notes-  sticky-  lib/    lib/    api/notes  api/notes  presence  lib/auth  Docker  trash/  pkg+    page
                    app.tsx editor  canvas  chrome  list    card     notes   bounds  route.ts   [id]      +hub      lib       files   actions README  .tsx
SAA-92                  .      X       .       .       .       .       .       .        .          .         .         .        .       .      .      .
SAA-93                  X      .       .       .       .       .       .       .        .          .         .         .        .       .      .      .
SAA-95                  .      X       .       .       .       .       X       .        X          X         .         .        .       .      .      .
SAA-96 (in flight)      X      X       .       .       .       .       X*      .        X          X         X         X        ?       .      .      ?
SAA-97                  .      X       .       .       .       .       .       .        .          .         .         .        ?       X      .      .
SAA-98                  .      .       X       .       .       .       .       X        .          .         .         .        .       .      .      .
SAA-99                  X      .(fix)  .       .       X       .       .       .        .          .         .         .        .       .      .      .
SAA-100                 .      .       .       .       .       .       .       .        .          .         .         consumes  X       .      .      .
SAA-101                 .      .       .       .       X       .       .       .        .          .         .         .        .       .      .      .
SAA-102                 .      .       X       .       .       .       .       .        .          .         .         .        .       .      .      .
SAA-103                 .      .      (X?)     .       .       X       .       .        .          .         .         .        .       .      .      .
SAA-104                 .      .       .       X       .       .       .       .        .          .         .         .        .       .      .      .
SAA-105                 .      .       .       .       .       .       .      (X?)      .          X         .         .        .       .      .      .
SAA-106                 X     (toast?) .       .       .       .       .       .        .          X         .         .        .       .      .      .
SAA-107                 X      .       .       .       .       .       .       .        .          .         .         .        .       .      X      X
```
`X*` = `lib/notes.ts` serializeNote is already touched by Phase 1 and will be by Phase 2 push serialization. `?` = hosting-model dependent.

**Read it as:** any column with an `X` in the SAA-96 row (board-app, note-editor, lib/notes, api/notes, presence, auth lib, Docker*) is BLOCKED for concurrent tickets. Batch 1 tickets occupy columns with no SAA-96 `X`.

---

## Recommended batches

### Batch 1 — start NOW (low complexity, all files disjoint from SAA-96 and from each other)

| Ticket | What | Files | Why it's easy + safe |
|---|---|---|---|
| **SAA-101** | Add an "updated at" column to list rows | `notes-list.tsx` only | The data already flows (`serializeNote` emits `updatedAt`, `CanvasNote` has it) — purely a render/formatting change. No other ticket touches `notes-list.tsx`. |
| **SAA-102** (hide-only) | Remove/hide the two disabled "Paste" / "Zoom to fit" menu items | `board-canvas.tsx` | The ticket explicitly allows "implement **or hide** until pan/zoom and clipboard support land". Hiding is a one-file, two-button change today; implementing belongs with SAA-98 (Batch 3). |
| **SAA-103** | Dynamic paper-flap motion while dragging | `sticky-note-card.tsx` | Pure visual polish in the card component (its flap markup/classes exist). **Constraint:** keep it inside `sticky-note-card.tsx` (transform/animation driven by the existing `dragging` prop). If the design requires real overlap detection, that needs data from `board-canvas.tsx` — coordinate with SAA-102 if so (still safe vs SAA-96). |
| **SAA-104** | Kill the hydration mismatch in the header | `board-chrome.tsx` | Fix the `useSearchParams` usage inside the component (local Suspense or null-guard). **Constraint:** do NOT fix it by lifting params into `board-app.tsx` — that file is SAA-96's. |
| **SAA-100** | Bake `NEXT_PUBLIC_APP_URL` into the Docker build | `Dockerfile`, `docker-compose.yml`, `.env.example` | Additive `ARG`/`ENV` + compose `build.args` lines; no source code involved. Only watch-item: SAA-96's hosting model TBD may later edit `Dockerfile` CMD for a custom WS server — different lines, low collision risk; ping SAA-96's owner before merging if the CMD region is touched. |
| **SAA-107** (parts) | Fix Trash back link; remove `next-themes`; sync README | `trash/page.tsx`, `package.json`, `README.md` | One-line link fix (`/` → `/?board=team`, `trash/page.tsx:41`); `next-themes` has zero repo-wide usage (grep confirmed) so it's a safe `package.json`+lockfile removal; README "What's in v1" is already mostly current — just confirm the "Still coming" list matches open tickets. **Defer the other SAA-107 items** (mount double-fetch, `initialBoard` prop) to Batch 2 — they're in `board-app.tsx`/`page.tsx`. |

**Why Batch 1 is safe in parallel:** columns are disjoint — `notes-list.tsx` (SAA-101), `board-canvas.tsx` (SAA-102), `sticky-note-card.tsx` (SAA-103), `board-chrome.tsx` (SAA-104), Docker/compose (SAA-100), `trash/page.tsx`+`package.json`+`README.md` (SAA-107 slices). None of these files appears in SAA-96's surface (board-app, note-editor, lib/auth*, api/notes, ws entry) — verified file-by-file in the matrix above. Each is verifiable with `npm run build` + dev-server smoke + a browser check (SAA-103/104 visual, SAA-101/102 functional).

### Batch 2 — AFTER SAA-96 lands (overlaps SAA-96's file surface, or depends on its decisions)

| Ticket | Why it waits |
|---|---|
| **SAA-92** (autosave flush on unmount) | Lives in `note-editor.tsx` — SAA-96's surface. Phase 2 may touch the save path (WS push + LWW). It's a ~5-line change; if SAA-96's plan explicitly excludes `note-editor.tsx`, this can be pulled forward with a handshake with the SAA-96 owner. |
| **SAA-93** (rollback on failed move PATCH) | Lives in `board-app.tsx` `moveNote` — SAA-96's primary client file. When WS push lands, optimistic-update/ack semantics change; write the rollback against the final sync flow, not the current polling one. |
| **SAA-99** (mobile list-first) | The view-default logic sits in `board-app.tsx` next to presence/sync code; also decides `?view` semantics that WS-era refresh behavior will build on. |
| **SAA-105** (server-side dimension validation) | Edits `api/notes/[id]/route.ts` PATCH — SAA-96 emits `note.*` events from these same handlers. Coordinate with SAA-106: both touch the same PATCH function, so do them as one paired change. |
| **SAA-106** (LWW conflict toast) | Ticket itself says it depends on WebSocket/realtime. Detection UI already shipped in Phase 1; the remaining work is the PATCH-side version guard + a real toast in `board-app.tsx` — both SAA-96 files. Pair with SAA-105 on the shared PATCH. |
| **SAA-107** (remaining parts: mount double-fetch, unused `initialBoard` prop) | The double-fetch may disappear entirely if WS push replaces polling; the prop trim touches `board-app.tsx` + `page.tsx` together. Do after SAA-96's props/sync settle. |

**Sequencing note:** within Batch 2, SAA-105 + SAA-106 should be implemented as one coordinated pair (single PATCH handler), and SAA-92 before SAA-95 is scheduled (both rewrite editor save paths).

### Batch 3 — later (big features or serialized dependencies)

| Ticket | Reason to defer |
|---|---|
| **SAA-95** (TipTap rich text + checklists) | The largest single feature: replaces the `<textarea>` + draft state in `note-editor.tsx`, changes the `bodyJson` storage contract in `lib/notes.ts` (`{text}` → TipTap doc JSON, GAP-014), the PATCH/POST body contract in `api/notes/*`, and preview serialization + card/list rendering. It collides with SAA-96 (editor + api/notes), SAA-92 (editor), and SAA-97 (editor UI). Do it ALONE, after SAA-96/Batch 2 — and before SAA-97, whose attachment UI should be built into the new editor rather than the textarea. |
| **SAA-97** (attachments) | New upload/serve routes + editor UI + disk cleanup on purge (`trash/actions.ts`). M–L and depends on the editor being rewritten (SAA-95); purge-file cleanup can be extracted early, but the upload API + UI should come after SAA-95. |
| **SAA-98** (pan/zoom) + **SAA-102** (implement Paste/Zoom-to-fit) | Pan/zoom is the only genuinely medium-complexity ticket that does NOT overlap SAA-96 — it *could* start today on `board-canvas.tsx`+`lib/note-bounds.ts`, but it's not a low-complexity win: transform state, wheel-zoom, pan-gesture vs note-drag pointer capture, board-coordinate clamping (GAP-009), and math for zoom-to-fit. SAA-102's real implementations ("Paste" needs clipboard reads, "Zoom to fit" needs pan/zoom) belong with it — same file. |

---

## SAA-96 conflict callout (summary)

- **Blocked until SAA-96 lands:** SAA-92, SAA-93, SAA-99, SAA-105, SAA-106, and the `board-app.tsx`/`page.tsx` half of SAA-107 — these write to `note-editor.tsx`, `board-app.tsx`, or `api/notes/*`.
- **Watch item:** SAA-100 edits Docker files; SAA-96's hosting model (custom server vs Next route upgrade) may change the Dockerfile CMD. Keep the CMD region untouched in SAA-100.
- **Safe now:** SAA-101, SAA-102 (hide-only), SAA-103, SAA-104, SAA-100, and the trash-link/dep/README slices of SAA-107.
- **Do not schedule concurrently with each other:** SAA-95/SAA-92/SAA-97 (editor), SAA-98/SAA-102 (canvas), SAA-105/SAA-106 (same PATCH).

## Verification guidance (repo-wide)

No test runner exists. For every ticket: `npm run build` (the only CI-equivalent), then `npm run dev` + browser checks (two tabs for anything presence-related; `docker compose up --build` for SAA-100). SAA-103 and SAA-104 are visual — confirm in a real browser, not headless.

*Repository modified during this analysis: none. Only this file was added (`docs/analysis/`); the pre-existing `CONTEXT.md` modification is untouched — see `git status --porcelain`.*
