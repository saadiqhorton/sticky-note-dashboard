# Stickyboard

Open-source, self-hosted sticky-note dashboard for internal teams. One shared **Team Board**, one **Private Board** per person, cream paper UI, and real-time edit presence.

![Stickyboard team board — IT help desk example](docs/images/stickyboard-preview.png)

Design reference: [Figma — Sticky Note Dashboard](https://www.figma.com/design/JPBHDqVS3MlPJd6tNiZRhy)

## Quick start (Docker Compose)

```bash
cp .env.example .env
# set ADMIN_EMAIL, ADMIN_PASSWORD (12+ chars, letters + numbers), BETTER_AUTH_SECRET

docker compose up --build
```

App: http://localhost:3000  
Sign in with your admin credentials from `.env`.

Docker / production bootstrap **requires** `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD`
(no compose defaults). The container exits if they are missing or weak.

## Local development

```bash
cp .env.example .env
# Ensure Postgres is available at DATABASE_URL (Compose DB or local Postgres)
# Set ADMIN_EMAIL / ADMIN_PASSWORD before bootstrap if you want a first admin
docker compose up db -d   # optional if using Compose Postgres
npm install
npx prisma migrate deploy
npm run bootstrap
npm run dev
```

## Env vars

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Auth signing secret |
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
- Near-live note sync (polling) + real-time edit presence (SSE)

## Still coming

- TipTap rich text + checklist + attachments
- Push-based live board sync (beyond presence)
- Stronger paper-flap motion polish
- Pan/zoom canvas
