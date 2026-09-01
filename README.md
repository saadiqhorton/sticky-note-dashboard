# Stickyboard

Open-source, self-hosted sticky-note dashboard for internal teams. One shared **Team Board**, one **Private Board** per person, cream paper UI, and real-time edit presence.

![Stickyboard team board — IT help desk example](docs/images/stickyboard-preview.png)

Design reference: [Figma — Sticky Note Dashboard](https://www.figma.com/design/JPBHDqVS3MlPJd6tNiZRhy)

## Quick start (Docker Compose)

```bash
cp .env.example .env
# set POSTGRES_PASSWORD (openssl rand -hex 32), ADMIN_EMAIL, and
# ADMIN_PASSWORD (8+ chars, letters + numbers)
# BETTER_AUTH_SECRET can stay empty — Docker creates one on first boot

docker compose up --build
```

App: http://localhost:3000  
Sign in with your admin credentials from `.env`.

Docker / production bootstrap **requires** `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD`
(no compose defaults). The container exits if they are missing or weak.

Postgres is **not** published on the host. The app reaches it only on the Compose
network (`db:5432`). `POSTGRES_PASSWORD` is required (no default); generate with
`openssl rand -hex 32`. The app refuses to start if the password is missing or weak.

`BETTER_AUTH_SECRET` is optional in Docker: if you leave it unset, the app
generates a unique secret on first boot and keeps it on the uploads volume.
Known placeholder values (like `change-me-to-a-long-random-string`) are rejected.

If you previously ran Compose with the old default password, recreate the Postgres
volume after setting a new `POSTGRES_PASSWORD` — Postgres only applies that env
var on first database init (`docker compose down -v` then `up --build`).

## Local development

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD (openssl rand -hex 32) and matching DATABASE_URL
# Set BETTER_AUTH_SECRET to any long random value for local npm run dev
# Set ADMIN_EMAIL / ADMIN_PASSWORD before bootstrap if you want a first admin

# Optional: Compose Postgres with host port 5433 for npm run dev
docker compose -f docker-compose.yml -f docker-compose.dev.yml up db -d

npm install
npx prisma migrate deploy
npm run bootstrap
npm run dev
```

Use `DATABASE_URL=postgresql://stickyboard:<POSTGRES_PASSWORD>@localhost:5433/stickyboard`
when using the optional `docker-compose.dev.yml` overlay.

## Env vars

| Variable | Purpose |
|----------|---------|
| `POSTGRES_PASSWORD` | Compose Postgres password (required; strong generated secret) |
| `DATABASE_URL` | Postgres connection string (local npm / tools) |
| `BETTER_AUTH_SECRET` | Auth signing secret (optional in Docker; auto-generated if unset) |
| `BETTER_AUTH_URL` / `APP_URL` | Public app URL |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin (bootstrap; required in production) |
| `UPLOAD_DIR` | Local attachment storage path |

## What’s in v1 so far

- Email/password auth (Better Auth)
- Env-based first admin + invite copy-links
- Company + private boards
- Canvas with drag, right-click create, maximize editor
- List view + keyword search
- Soft delete / Trash restore; admin purge
- Yellow/cream theme from locked Figma tokens
- Live board sync (SSE push) + real-time edit presence

## Still coming

- Rich text editing + checklists in note bodies
- File attachments
- Pan/zoom canvas + clipboard paste on board
- Mobile default-to-list view
- Autosave flush on unexpected navigation
- Reliable drag-move saves
