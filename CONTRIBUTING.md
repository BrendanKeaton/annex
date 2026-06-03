# Contributing

This is a solo-developer project maintained in spare time and provided
**as-is**. You're welcome to open issues or pull requests, but please set
expectations accordingly: **there's no guarantee they'll be reviewed, answered,
or merged**, and there are no support commitments. Forking is encouraged if you
need something on your own timeline.

If you do want to send a change, the setup below should get you running.

## Getting started

Prerequisites: **Docker**, **Node.js + npm**, **Python 3**, and (for the
desktop app) **Rust**.

```sh
git clone <your-fork-url>
cd asera
./start-local.sh          # boots Supabase + backend + webapp + desktop
```

`start-local.sh` installs dependencies (Python venv, npm), boots the
self-hosted Supabase stack, applies the database schema, and runs all apps. See
the [README](README.md) and [infra/supabase/RUNBOOK.md](infra/supabase/RUNBOOK.md)
for details.

## Project layout

- `apps/backend` — FastAPI (Python)
- `apps/webapp` — Next.js
- `apps/desktop` — Tauri + SolidJS
- `infra/supabase` — self-hosted Supabase stack & DB schema (`schema/`)

## Checks before a PR

Backend:

```sh
cd apps/backend && source venv/bin/activate && pytest
```

Webapp:

```sh
cd apps/webapp && npm run lint && npm run build
```

Database schema: the source of truth is `infra/supabase/schema/*.sql`. Add a new
numbered file (e.g. `0004_*.sql`) rather than editing applied ones, and apply
with `infra/supabase/apply-schema.sh`.

## Ground rules

- Never commit secrets — `.env` files are gitignored; use the `.env.example`
  templates. (See [SECURITY.md](SECURITY.md).)
- Contributions are accepted under the project's [MIT License](LICENSE).
