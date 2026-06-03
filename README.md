# Annex

A **learning project** exploring client-side cryptography for locally-run AI
agents — built as a personal experiment and as the companion code to a blog
post about what I built and how.

> ## ⚠️ Educational experiment — do NOT use this
>
> This is a solo learning exercise, **not a product**. It is **unaudited,
> incomplete, and explicitly NOT intended for production or any real-world
> use.** Do not use it to protect real data, real systems, or anything you
> care about. It exists to explore a cryptography use case and to document the
> process — nothing more.
>
> Provided **as-is**, with no warranty and **no support, maintenance, or
> guaranteed responses**. Issues/PRs may be ignored. GitHub is the only
> channel. **Use at your own risk — but really, don't use it.**

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

## Disclaimer & intended use

Annex is an **educational experiment** — code written to explore a
client-side cryptography use case for locally-run AI agents and to accompany a
write-up about it. **It is not intended to be used by anyone for any real
purpose.** Please don't deploy it, don't rely on it, and don't use it to
protect real data or systems. If you're here from the blog post, treat this as
a reference/learning artifact, not software to run in earnest.

- **Not for production / not for real use.** This is a learning project. It is
  not designed, hardened, or supported for production, commercial, or any
  real-world use. The author recommends against using it at all.
- **No warranty.** The software is provided "AS IS", without warranty of any
  kind, and with no guarantee that it is secure, error-free, or fit for any
  particular purpose (see the [MIT License](LICENSE)).
- **Not a security guarantee.** The cryptography here was written to learn, not
  reviewed for real-world security. It may be broken, incomplete, or wrong. Do
  not trust it to protect anything.
- **Unaudited & experimental.** This code has **not** undergone any independent
  or professional security review or audit. It is early-stage software that may
  change in breaking ways without notice.
- **Data loss is possible.** Bugs, destructive operations (e.g. `--wipe`), and
  breaking changes can cause **permanent, irreversible data loss**. In
  particular, data encrypted by Annex cannot be recovered if the encryption
  key/seed is lost. Back up anything you care about and test in a throwaway
  environment first.
- **Your responsibility.** You alone are responsible for how you use this
  software and for complying with all applicable laws and regulations in your
  jurisdiction (including computer-misuse and export-control laws). Do not use
  it on systems you do not own or are not authorized to access. Any misuse is
  the user's responsibility, not the author's.
- **Not professional advice.** Nothing in this project constitutes legal or
  security advice.

## License

[MIT](LICENSE)
