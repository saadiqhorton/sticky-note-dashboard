# Gap Analysis: Stickyboard codebase vs v1 spec

## Comparison Direction

**Current state:** `/home/dezignerdrugz/sticky-note-dashboard` (implemented code, schema, Docker, README).  
**Desired state:** v1 spec in `.cursor/plans/sticky_note_dashboard_a14cc3c8.plan.md`, `CONTEXT.md`, and `README.md` “What’s in v1” / “Still coming” sections.

Default comparison direction: current state checked for coverage of desired state.

## Scope

Comparison areas (per user request): auth+invites, team+private boards, canvas interactions, list+search, trash, autosave, bounds, TipTap+attachments, WebSocket presence/sync, theme, Docker, mobile list path, board=team URL.

Excluded: code quality/coupling review, runtime profiling, Figma pixel-perfect audit, OAuth/SMTP (explicit non-goals).

## Actors and Modes Observed

- **Admin** — invite creation (copy link), user deactivation, permanent trash purge
- **Member** — full edit on company board, owner-only private board, trash restore
- **Interactive browser UI** — canvas view, list view, maximized note editor, trash/admin/login/invite pages
- **Automated bootstrap** — env-based first admin + company board on container start
- **API surfaces** — REST notes CRUD, invite accept, Better Auth session endpoints
- **Realtime (specified, not implemented)** — WebSocket presence and live board sync

## Summary

Compared the sticky-note-dashboard codebase against the v1 product plan (auth, boards, canvas, list/search, trash, autosave, bounds, TipTap/attachments, WebSocket, theme, Docker, mobile list, `board=team` URL). Seven areas are substantially done; five are partial; TipTap+attachments and WebSocket presence/sync are missing. Several security and data-integrity bugs remain in otherwise-complete areas.

| Category | Count | Description |
|----------|-------|-------------|
| Missing | 2 | Elements in desired state with no current state correspondence |
| Partial | 8 | Elements present in both but incompletely covered |
| Divergent | 1 | Same concern addressed in incompatible ways |
| Implicit | 1 | Desired state assumes capability neither confirmed nor denied |

### Feature matrix (DONE / PARTIAL / MISSING)

| Area | Status | Evidence |
|------|--------|----------|
| auth+invites | **PARTIAL** | `src/lib/auth.ts`, `src/app/admin/*`, `src/app/invite/[token]/page.tsx`, `src/app/api/invites/[token]/accept/route.ts` |
| team+private boards | **DONE** | `prisma/schema.prisma` (BoardType), `src/lib/notes.ts`, `src/components/board-chrome.tsx` |
| canvas interactions | **PARTIAL** | `src/components/board-canvas.tsx`, `src/components/sticky-note-card.tsx` |
| list+search | **PARTIAL** | `src/components/board-chrome.tsx`, `src/components/notes-list.tsx`, `src/components/board-app.tsx` |
| trash | **DONE** | `src/app/trash/page.tsx`, `src/app/trash/actions.ts`, DELETE in `src/app/api/notes/[id]/route.ts` |
| autosave | **PARTIAL** | `src/components/note-editor.tsx` (700ms debounce, status UI) |
| bounds | **PARTIAL** | `src/lib/note-bounds.ts`, used in canvas + API routes |
| TipTap+attachments | **MISSING** | Schema only: `prisma/schema.prisma`; deps unused in `src/` |
| WebSocket presence/sync | **MISSING** | `ws` dep in `package.json`; `editingBy: null` stub in `src/lib/notes.ts` |
| theme | **DONE** | `src/lib/theme.ts`, `src/app/globals.css`, `src/app/layout.tsx` fonts |
| Docker | **DONE** | `docker-compose.yml`, `Dockerfile`, `scripts/bootstrap.mjs` |
| mobile list path | **MISSING** | No viewport detection or mobile default in `src/` |
| board=team URL | **DONE** | `src/lib/board-param.ts`, `src/app/page.tsx` legacy redirect |

Full analysis written to: `/home/dezignerdrugz/sticky-note-dashboard/GAP-ANALYSIS-v1.md`

## Findings

**GAP-001: Open email signup bypasses invite-only model**
- **Category:** Partial
- **Feature/Behavior:** Invite-only access — teammates onboard only via admin-issued token link
- **Current State:** `src/lib/auth.ts:9-11` enables `emailAndPassword` with no `disableSignUp`; Better Auth exposes `/api/auth/sign-up/email` via `src/app/api/auth/[...all]/route.ts:1-4`
- **Desired State:** Plan §Resolved decisions: “invite-only via copyable link”; §Auth & bootstrap: “Admin creates invite → copy link → teammate sets password”

**GAP-002: TipTap rich text and checklist not wired**
- **Category:** Missing
- **Feature/Behavior:** Note body as TipTap JSON with rich text, links, and interactive checklist (task list nodes)
- **Current State:** `@tiptap/*` in `package.json:16-22` but zero imports under `src/`; `src/components/note-editor.tsx:308-313` uses plain `<textarea>`; `src/lib/notes.ts:11-12` stores `{ text: preview }` not TipTap document JSON
- **Desired State:** Plan §Note content: “TipTap rich text + links, interactive checklist”; §Data model: “Checklist lives inside TipTap JSON”

**GAP-003: Attachments schema without upload/serve/purge**
- **Category:** Missing
- **Feature/Behavior:** File attachments on sticky notes with local Docker volume storage
- **Current State:** `prisma/schema.prisma:139-150` defines `Attachment`; `UPLOAD_DIR` in `.env.example:12` and `docker-compose.yml:32-34`; no `src/app/api/**` upload routes, no editor UI, purge in `src/app/trash/actions.ts:26-29` deletes note row only
- **Desired State:** Plan §Note content: “attachments”; §Storage: “Local Docker volume for attachments”; §Deliverables item 2: “TipTap + checklist + attachments”

**GAP-004: WebSocket presence and live board sync absent**
- **Category:** Missing
- **Feature/Behavior:** Realtime `note.*` events, `presence.join/leave/editing`, live board updates, editing warning from presence
- **Current State:** `ws` in `package.json:29` unused; `src/lib/notes.ts:27` hardcodes `editingBy: null`; `src/components/board-app.tsx:148-151` warning branch never fires; no WebSocket server or client hook in `src/`
- **Desired State:** Plan §Collaboration: “WebSocket presence + live board updates”; §Realtime events: `note.created/updated/moved/deleted/restored`, `presence.*`; §Architecture: custom WebSocket endpoint

**GAP-005: Canvas pan/zoom not implemented**
- **Category:** Partial
- **Feature/Behavior:** Pannable/zoomable board surface
- **Current State:** `src/components/board-canvas.tsx:249` fixed viewport `min-h-[calc(100vh-4.5rem)]`; menu items “Paste” / “Zoom to fit” disabled at `board-canvas.tsx:311-316`; `README.md:58` lists “Pan/zoom canvas” under Still coming
- **Desired State:** Plan §Canvas: “pan/zoom”; §Deliverables item 2: “canvas (pan/zoom/drag)”

**GAP-006: Canvas context menu secondary actions stubbed**
- **Category:** Partial
- **Feature/Behavior:** Right-click empty canvas → New note + Paste + Zoom to fit
- **Current State:** `src/components/board-canvas.tsx:296-316` — New note works; Paste and Zoom to fit `disabled`
- **Desired State:** Plan §Canvas interactions: “also Paste / Zoom to fit as secondary items”

**GAP-007: List view missing updated-at column**
- **Category:** Partial
- **Feature/Behavior:** List rows show title, color chip, updated-at, open into editor
- **Current State:** `src/components/notes-list.tsx:44-49` shows title + preview only; `serializeNote` in `src/lib/notes.ts:15-28` omits `updatedAt`
- **Desired State:** Plan §UI/UX: “List view: title, color chip, updated-at, open into same editor”

**GAP-008: Mobile list-first path not implemented**
- **Category:** Missing
- **Feature/Behavior:** On mobile, default to list view; open note full-screen
- **Current State:** No `matchMedia`, user-agent, or responsive default in `src/`; `board-app.tsx:26` defaults to canvas when `view` param absent; no mobile-specific layout beyond generic `flex-wrap` in `board-chrome.tsx:84`
- **Desired State:** Plan §Mobile: “default to list; open note full-screen”; todos `theme-mobile`: “desktop-first mobile list path”

**GAP-009: Bounds use viewport proxy, not pannable canvas**
- **Category:** Partial
- **Feature/Behavior:** Notes stay within valid board area as user navigates canvas
- **Current State:** `src/lib/note-bounds.ts:8-10` comment “until pan/zoom adds a real canvas size”; client clamps to `surfaceRef` viewport (`board-canvas.tsx:70-84`); server uses 5000×5000 ceiling (`note-bounds.ts:45-53`)
- **Desired State:** Plan §Canvas: free-position notes on pannable board; bounds should follow board coordinate space, not viewport-only

**GAP-010: Autosave does not flush on unexpected unmount**
- **Category:** Partial
- **Feature/Behavior:** Edits persist reliably without manual save
- **Current State:** `src/components/note-editor.tsx:157-164` debounced save; `flushAndClose` on intentional close; cleanup at `209-214` only clears timer, does not call `persist()`
- **Desired State:** Plan §Collaboration implies durable saves; README lists autosave as in-scope v1 behavior

**GAP-011: Note move PATCH failures are silent**
- **Category:** Partial
- **Feature/Behavior:** Drag position persists to server
- **Current State:** `src/components/board-app.tsx:69-78` optimistically updates state then `await fetch` with no `response.ok` check or rollback
- **Desired State:** Plan §Collaboration / realtime implies authoritative server state for layout

**GAP-012: Board switch can flash stale notes**
- **Category:** Partial
- **Feature/Behavior:** Switching Team ↔ My board shows correct notes immediately
- **Current State:** `src/components/board-app.tsx:30-47` seeds `useState(initialNotes)` from SSR for first board only; `loadNotes` is async on `board` change with no loading guard or note clear
- **Desired State:** Plan §Boards: distinct company vs private canvases with correct isolation

**GAP-013: Invite optional email hint not enforced**
- **Category:** Partial
- **Feature/Behavior:** Admin may set email hint on invite; accept flow respects it
- **Current State:** `src/app/admin/actions.ts:9` stores optional `email`; `src/app/api/invites/[token]/accept/route.ts:16-27` never compares submitted email to `invite.email`
- **Desired State:** Plan §Invite model: `email optional` — when set, implied constraint on who may consume token

**GAP-014: bodyJson storage diverges from TipTap contract**
- **Category:** Divergent
- **Feature/Behavior:** `bodyJson` holds TipTap document JSON
- **Current State:** `src/lib/notes.ts:11-12` `bodyFromPreview` → `{ text: string }`; PATCH accepts `preview` string (`src/app/api/notes/[id]/route.ts:60-61`)
- **Desired State:** Plan §Data model: “bodyJson”; “Checklist lives inside TipTap JSON (task list nodes)”

**GAP-015: Paper-flap / overlap polish incomplete**
- **Category:** Partial
- **Feature/Behavior:** Corner flap/curl on drag; realistic overlap feel
- **Current State:** `sticky-note-card.tsx:56-65` shadow + rotation on drag; static corner span at `68-75`; no dynamic flap across overlaps
- **Desired State:** Plan §Canvas interactions: “corner flap/curl that reacts as notes peel across each other”; README §Still coming: “Stronger paper-flap motion polish”

**GAP-016: Conflict detection via updatedAt unspecified in code**
- **Category:** Implicit
- **Feature/Behavior:** LWW save with toast on `updatedAt` version conflict
- **Current State:** PATCH in `src/app/api/notes/[id]/route.ts:56-72` blind overwrite; no optimistic locking or client conflict toast
- **Desired State:** Plan §Realtime events: “toast if version conflict detected via `updatedAt`” — depends on WebSocket layer not yet built

## Bugs and polish items (cross-cutting)

| Severity | Item | Location |
|----------|------|----------|
| High | Open `/api/auth/sign-up/email` allows non-invite account creation | `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts` |
| Medium | Drag position may desync from DB on failed PATCH | `src/components/board-app.tsx:69-78` |
| Medium | Board param change may briefly show wrong-board notes | `src/components/board-app.tsx:30-47` |
| Medium | Closing editor via navigation (not Back) may drop unsaved edits | `src/components/note-editor.tsx:209-214` |
| Low | Trash “← Board” links to `/` not `/?board=team` | `src/app/trash/page.tsx:41` |
| Low | Login success redirects to `/` (works but omits explicit team default) | `src/app/login/page.tsx:31` |
| Low | Search filtered twice (parent + list) — redundant | `board-app.tsx:111-117`, `notes-list.tsx:14-20` |
| Low | Purge does not delete attachment files from `UPLOAD_DIR` | `src/app/trash/actions.ts:26-29` |
| Polish | `next-themes` dependency unused | `package.json:26` |
| Polish | Presence chip UI exists but never populated | `sticky-note-card.tsx:82-86`, `notes.ts:27` |
| Polish | README still lists TipTap/WebSocket as “coming” while plan todos mark boards-notes complete | `README.md:53-57` vs plan frontmatter |

## Areas Needing Separate Analysis

- **Security hardening pass** — invite-only enforcement, API input validation (numeric bounds on x/y/zIndex), attachment upload auth/size limits (once built). Warranted because GAP-001 is a live auth bypass.
- **Figma pixel audit** — visual parity with locked frames not compared here; theme tokens appear aligned at CSS level only.
- **E2E / runtime verification** — Docker boot, double-click open, autosave timing not exercised in this document-level analysis.
