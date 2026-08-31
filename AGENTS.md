<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:repo-hygiene-rules -->
# Keep tracker / agent internals out of the repo

This repo is public. Do **not** bake personal, workspace, or agent-environment specifics into committed files.

## Forbidden in committed paths, code, scripts, comments, and docs
- Internal issue-tracker IDs or slugs (e.g. `PROJ-123`, Jira-style keys, private board names)
- Cloud-agent or machine paths (e.g. `/opt/some-agent/...`, home-directory scratch paths)
- Personal emails, org-internal URLs, secrets, or local-only tooling layout

## Do instead
- Name files/scripts by **behavior** (`signup-disabled.integration.ts`, `test:signup-disabled`), not by ticket ID
- Write test/evidence output under a **repo-local** ignored dir such as `tmp/` (already gitignored), or only when an explicit env override is set
- Keep tracker IDs in PR/Linear discussion if useful — not in the tree that ships

If a change would only make sense inside a Cursor VM or a private ticket, it does not belong in this repository.
<!-- END:repo-hygiene-rules -->
