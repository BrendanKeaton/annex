# Annex

Backend service for Annex, a file encryption and secure access platform. Built with FastAPI, Supabase (Postgres + Auth), and deployed via Gunicorn/Uvicorn.

## Features

- Session-based authentication backed by Supabase Auth (email/password, OAuth, refresh, invites)
- Account management (email, password, PIN, recovery codes)
- Organizations and shared "paths" (encrypted resource hierarchies)
- AES-based key derivation and per-user encryption helpers
- Per-IP and per-user rate limiting (SlowAPI)
- Structured JSON logging with request IDs and unhandled-exception capture
- Defense-in-depth security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy)

## Requirements

- Python 3.8+ (CI runs 3.13)
- A Supabase project (free tier works)

## Quickstart

```bash
git clone <your-fork-url> annex-backend
cd annex-backend

cp .env.example .env
# Edit .env and fill in SUPABASE_URL, SUPABASE_KEY, RANDOM_AES_SEED, etc.

./run.sh
```

The server starts at `http://localhost:8000`. When `ENVIRONMENT=DEVELOPMENT`, Swagger docs are available at `/docs`.

## Environment variables

See [.env.example](.env.example) for the full list. The required ones are:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Supabase service-role (secret) key |
| `RANDOM_AES_SEED` | 32-byte hex string used as AES seed |
| `ENVIRONMENT` | `DEVELOPMENT`, `STAGING`, or `PRODUCTION` |
| `CORS_ORIGINS` | Comma-separated allowed origins |

## Running tests

```bash
python -m pytest tests/ -v
```

CI runs the same suite on every push and pull request against `main`.

## Deployment

A `Procfile` is included for Heroku-style deployments:

```
web: gunicorn app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --timeout 120 --bind 0.0.0.0:$PORT
```

Any platform that respects a Procfile (Heroku, Railway, Render, Fly.io with a custom command, etc.) will work the same way.

## License

[MIT](LICENSE).
