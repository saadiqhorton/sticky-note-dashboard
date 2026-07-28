# Issue tracker: Linear

Issues for this repo live in **Linear**, on team **Saadiqhorton**, under project **[Stickyboard](https://linear.app/saadiqhorton/project/stickyboard-f12aa84598e6)**.

Use the Linear MCP server (`plugin-linear-linear`) or the Linear web UI for all operations.

## Conventions

- **Create an issue**: `save_issue` with `team: "Saadiqhorton"`, `project: "Stickyboard"`, `title`, and markdown `description`.
- **Read an issue**: `get_issue` by identifier (e.g. `SAA-84`) or list with `list_issues` filtered by `project: "Stickyboard"`.
- **Update an issue**: `save_issue` with `id` set to the issue identifier or UUID.
- **Priority**: `1` = Urgent, `2` = High, `3` = Medium, `4` = Low, `0` = None.
- **Prefix titles** by type when creating from skills: `[SEC]`, `[BUG]`, `[FEAT]`, `[POLISH]`, `[CHORE]`.

## Project context

- **Repo**: `/home/dezignerdrugz/sticky-note-dashboard`
- **Domain glossary**: `CONTEXT.md`
- **Gap analysis**: `GAP-ANALYSIS-v1.md`
- **Security review**: `security-analysis.md`
- **Design**: [Figma — Sticky Note Dashboard](https://www.figma.com/design/JPBHDqVS3MlPJd6tNiZRhy)

## When a skill says "publish to the issue tracker"

Create a Linear issue on team Saadiqhorton, project Stickyboard, with a clear title and markdown body referencing affected files.

## When a skill says "fetch the relevant ticket"

Use `get_issue` with the SAA identifier (e.g. `SAA-95`) or search `list_issues` with `query` matching the title.

## Pull requests as a triage surface

**PRs as a request surface: no.** This repo does not treat external PRs as feature requests in the triage queue.
