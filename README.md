# Annex

An open-source security platform for running AI Agents locally.

> **Project status:** Solo-developer project, provided **as-is** with no
> warranty and **no guaranteed support, maintenance, or response times**.
> Issues and pull requests are welcome via GitHub, but may not be reviewed,
> answered, or merged. GitHub is the only support channel. Use at your own risk.

## Structure

- **apps/backend** — Python/FastAPI backend
- **apps/desktop** — Tauri + SolidJS desktop app
- **apps/webapp** — Next.js web app
- **infra/supabase** — Self-hosted Supabase stack (Postgres, Auth, REST, Storage); see [infra/supabase/RUNBOOK.md](infra/supabase/RUNBOOK.md)
- **packages/** — Shared packages (coming soon)

## Local development

One command boots the self-hosted Supabase stack (Docker) and runs all apps,
installing dependencies (Python venv, npm) on first run:

```sh
./start-local.sh                 # supabase + backend + webapp + desktop
./start-local.sh --no-desktop    # skip the Tauri desktop app
./start-local.sh --backend-only  # supabase + backend only
```

`Ctrl+C` stops the apps but leaves Supabase running (it's stateful). To stop it:

```sh
./stop-local.sh          # stop Supabase, keep data
./stop-local.sh --wipe   # stop and delete all local data (destructive)
```

Prerequisites: Docker, Node/npm, Python 3, and (for the desktop app) Rust.

| Service  | URL |
|----------|-----|
| backend  | http://localhost:8000 (Swagger at `/docs`) |
| webapp   | http://localhost:3000 |
| desktop  | Tauri window (Vite dev on http://localhost:1420) |
| supabase | http://localhost:54321 (Studio dashboard) |
| mail     | http://localhost:8025 (Mailpit — captured emails) |

Supabase URL/keys live in `infra/supabase/.env` and are auto-synced into each
app's env file on every `start-local.sh` run.

## License

[MIT](LICENSE)
