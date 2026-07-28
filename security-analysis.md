# Security Analysis: Sticky Note Dashboard (full codebase)

## Scope

**Branch:** not specified (analysis against workspace at `/home/dezignerdrugz/sticky-note-dashboard`)

**First-party code reviewed:**
- `src/lib/auth.ts`, `src/lib/session.ts`, `src/lib/auth-client.ts`
- `src/app/api/auth/[...all]/route.ts`
- `src/app/api/notes/route.ts`, `src/app/api/notes/[id]/route.ts`
- `src/app/api/invites/[token]/accept/route.ts`
- `src/app/admin/actions.ts`, `src/app/admin/page.tsx`
- `src/app/trash/actions.ts`, `src/app/trash/page.tsx`
- `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/invite/[token]/page.tsx`
- `src/components/board-app.tsx`, `src/components/note-editor.tsx`, `src/components/sticky-note-card.tsx`, `src/components/notes-list.tsx`
- `scripts/bootstrap.mjs`, `prisma/schema.prisma`
- `docker-compose.yml`, `Dockerfile`, `.env.example`, `next.config.ts`

**Dependency manifests:** `package.json`, `package-lock.json` (locked: `next@16.2.12`, `better-auth@1.6.25`, `@prisma/client@6.19.3`, etc.)

**Live verification:** Running app at `http://localhost:3000` and Postgres on `localhost:5433` (Docker Compose defaults) were used to confirm exploit paths where noted below.

## Summary

Invite-only access is not enforced: Better Auth email sign-up remains open while the product model requires admin-issued invite links. Docker Compose ships and defaults weak, documented credentials for Postgres and the bootstrap admin account, and exposes the database on the host. Invite email hints are optional in the UI but never enforced server-side.

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 3     |
| Medium   | 1     |

Full analysis written to: `/home/dezignerdrugz/sticky-note-dashboard/security-analysis.md`

## Findings

**SEC-001: Open email sign-up bypasses invite-only onboarding**
- **OWASP:** A01 — Broken Access Control / A07 — Identification and Authentication Failures
- **Location:** `src/lib/auth.ts:9-11`, `src/app/api/auth/[...all]/route.ts:1-4`
- **Evidence:**
```typescript
  emailAndPassword: {
    enabled: true,
  },
```
```typescript
export const { GET, POST } = toNextJsHandler(auth);
```
- **EXPLOIT:**
  1. Attacker sends `POST /api/auth/sign-up/email` with JSON `{"name":"Attacker","email":"attacker@evil.com","password":"password123"}` (no invite token).
  2. Better Auth creates an active `member` user because `emailAndPassword.disableSignUp` is not set (see `better-auth` `sign-up.mjs`: sign-up is rejected only when `disableSignUp` is true).
  3. Attacker signs in via `/api/auth/sign-in/email` and gains full teammate access to the company board, trash restore, and note APIs protected by `requireApiUser()`.
  4. **Verified live:** HTTP 200 and user creation with `role:"member","active":true` without any invite.
- **Severity:** Critical

**SEC-002: Default admin credentials from Docker Compose bootstrap**
- **OWASP:** A02 — Cryptographic Failures / A05 — Security Misconfiguration / A07 — Identification and Authentication Failures
- **Location:** `docker-compose.yml:29-30`, `scripts/bootstrap.mjs:21-22`, `.env.example:9-10`
- **Evidence:**
```yaml
      ADMIN_EMAIL: ${ADMIN_EMAIL:-admin@example.com}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-changeme123}
```
```javascript
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
```
- **EXPLOIT:**
  1. Operator deploys with `docker compose up` without overriding `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
  2. `scripts/bootstrap.mjs` creates or elevates `admin@example.com` with password `changeme123` on every container start path (`Dockerfile:29`).
  3. Attacker signs in via `POST /api/auth/sign-in/email` with those documented defaults and receives an admin session (`role:"admin"`), enabling `/admin`, `createInvite`, `deactivateUser`, and `purgeNote`.
  4. **Verified live:** Sign-in with `admin@example.com` / `changeme123` returned admin user JSON and session token.
- **Severity:** High

**SEC-003: Postgres exposed on host with default credentials**
- **OWASP:** A02 — Cryptographic Failures / A05 — Security Misconfiguration
- **Location:** `docker-compose.yml:6-10`, `docker-compose.yml:25`
- **Evidence:**
```yaml
      POSTGRES_USER: stickyboard
      POSTGRES_PASSWORD: stickyboard
      POSTGRES_DB: stickyboard
    ports:
      - "5433:5432"
```
```yaml
      DATABASE_URL: postgresql://stickyboard:stickyboard@db:5432/stickyboard
```
- **EXPLOIT:**
  1. Operator runs Compose with published port `5433:5432` and default DB password (credentials are in the repo YAML).
  2. Attacker on the host LAN (or same machine) connects with `psql -h <host> -p 5433 -U stickyboard` and password `stickyboard`.
  3. Attacker reads or modifies all tables (`User`, `Account.password` hashes, `Session`, `Invite`, `Note`, etc.) — full authentication bypass and data exfiltration without touching the web app.
  4. **Verified live:** `psql` on `localhost:5433` with `stickyboard/stickyboard` returned all user emails and roles.
- **Severity:** High

**SEC-004: Weak default `BETTER_AUTH_SECRET` in Compose**
- **OWASP:** A02 — Cryptographic Failures / A05 — Security Misconfiguration
- **Location:** `docker-compose.yml:26`
- **Evidence:**
```yaml
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:-change-me-to-a-long-random-string}
```
- **EXPLOIT:**
  1. Deployer uses Compose without setting `BETTER_AUTH_SECRET`; the predictable default from the public repo is used to sign Better Auth session tokens.
  2. Attacker who knows the default (from `docker-compose.yml`) can forge valid session cookies/tokens for any user ID (including admin) using Better Auth’s signing scheme, obtaining admin UI and server-action access without knowing passwords.
  3. This is reachable on any deployment that relies on Compose defaults; local `.env` may override it, but the shipped default remains the deployment path for Docker users.
- **Severity:** High

**SEC-005: Invite email hint not enforced on accept**
- **OWASP:** A01 — Broken Access Control / A04 — Insecure Design
- **Location:** `src/app/admin/actions.ts:9`, `src/app/api/invites/[token]/accept/route.ts:16-27`
- **Evidence:**
```typescript
  const email = String(formData.get("email") ?? "").trim() || null;
```
```typescript
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite is invalid or expired" }, { status: 400 });
  }
  // no comparison between body.email and invite.email
```
- **EXPLOIT:**
  1. Admin creates invite with optional email hint `intended@company.com` (UI: “optional email hint”).
  2. Attacker obtains the invite link (forwarded email, Slack leak, admin UI screenshot, etc.).
  3. Attacker calls `POST /api/invites/{token}/accept` with `email:"wrong@evil.com"` instead of the hinted email.
  4. Server accepts and registers `wrong@evil.com` as a member; invite is consumed.
  5. **Verified live:** Invite created with `email:"intended@company.com"` accepted registration for `wrong@evil.com` (`{"ok":true}`).
- **Severity:** Medium

> **A03 — Injection:** No proven vulnerability found. Checked: Prisma ORM for all DB access (`prisma.note.*`, `prisma.user.*`, `prisma.invite.*`); no shell execution or `dangerouslySetInnerHTML`; note title/preview rendered as React text nodes in `sticky-note-card.tsx`, `note-editor.tsx`, `notes-list.tsx`.

> **A08 — Software and Data Integrity Failures:** No proven vulnerability found. Checked: no webhook handlers, no untrusted deserialization paths; invite accept uses explicit JSON parsing and Prisma writes.

> **A09 — Security Logging and Monitoring Failures:** No proven vulnerability found. Checked: auth failures return generic API errors; no evidence that successful invite bypass or sign-up is audited in application code.

> **A10 — Server-Side Request Forgery:** No proven vulnerability found. Checked: no user-controlled URL fetch, redirect, or proxy endpoints in `src/`.

> **Protocol 1 — Input-to-Sink Tracing:** No proven XSS or injection beyond SEC-001/SEC-005. User note `title`/`preview` flow: API body → `bodyJson` JSON → `serializeNote` → React `{note.title}` / `{note.preview}` without HTML sinks.

> **Protocol 2 — Auth/Authz Decision Audit:** Findings SEC-001, SEC-002, SEC-004, SEC-005. Admin server actions (`createInvite`, `deactivateUser`, `purgeNote`) correctly call `requireAdmin()`. Note APIs use `requireApiUser()`; company-board notes are intentionally editable by any member (`getOwnedNote` only restricts other users’ private boards). Trash `restoreNote` allows any member to restore deleted company-board notes by design (`CONTEXT.md`, `trash/page.tsx`).

> **Protocol 3 — Secret and PII Pattern Search:** Hardcoded/default secrets in `docker-compose.yml` (SEC-002, SEC-003, SEC-004). No API keys or private keys in `src/`. `.env.example` documents placeholder credentials (not runtime secrets).

> **Protocol 4 — Dependency Vulnerability Check:** `npm audit` reports high issues in `eslint`/`minimatch` (dev-only lint chain) and `postcss` via `next` (GHSA-qx2v-qp2m-jg93). No demonstrated runtime exploit path in this app’s request handlers or user-controlled CSS pipeline; not reported as SEC findings per evidence standard.

## Security Improvement Summary

### What Was Found

Four proven access-control and configuration issues (SEC-001, SEC-002, SEC-003, SEC-004) break the intended invite-only, least-privilege deployment model. One medium issue (SEC-005) makes optional invite email hints misleading. Role escalation via sign-up `role` field was tested and blocked (`input: false` on `role` in `auth.ts`).

### How to Improve

1. **SEC-001:** Set `emailAndPassword: { enabled: true, disableSignUp: true }` in `src/lib/auth.ts` so only `/api/invites/{token}/accept` can create users.
2. **SEC-005:** In `accept/route.ts`, if `invite.email` is set, reject requests where `body.email` (normalized) does not match.
3. **SEC-002:** Remove default `ADMIN_PASSWORD` / `ADMIN_EMAIL` from `docker-compose.yml`; require explicit secrets (fail bootstrap if unset in production).
4. **SEC-003:** Do not publish Postgres to the host in default Compose; use internal network only and strong generated passwords.
5. **SEC-004:** Remove default `BETTER_AUTH_SECRET`; generate at deploy time and refuse to start without a high-entropy secret.

### How to Prevent This Going Forward

1. Add an integration test that `POST /api/auth/sign-up/email` returns 400 when invite-only mode is enabled.
2. Add invite-accept tests for email-bound and open invites.
3. Use Compose `env_file` with required secrets and a pre-flight check in `bootstrap.mjs` that aborts on known weak values in production.
4. Run `npm audit` in CI but gate only on runtime dependency paths (exclude eslint dev chain unless exploitable in production).
