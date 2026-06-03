# Self-hosted Supabase — migration & operations runbook

This directory contains a **100% open-source, fully portable** Supabase stack
(Postgres + GoTrue auth + PostgREST + Storage + Kong gateway + Studio), pulled
from the official `supabase/supabase` `docker/` folder. It runs identically on
your laptop and on Railway, with **zero dependency on the Supabase cloud
service**.

> **Why self-host instead of ripping Supabase out?** The app uses PostgREST
> (`.from_`, `.rpc`), GoTrue auth, and Storage. Self-hosting the same OSS stack
> keeps all existing application code working — you only change which URL/keys
> it points at. Supabase the *software* is MIT/Apache licensed; running it
> yourself is not a dependency on Supabase the *company*.

The secrets in `.env` were generated locally for you (`utils/generate-keys.sh`
+ `utils/add-new-auth-keys.sh`). `.env` is gitignored — never commit it.

---

## Phase 2 — Dump your cloud schema (run this against your cloud project)

We are doing a **fresh start with no existing users**, so we only need your
*schema* (tables, the 7 RPC functions, RLS policies, constraints) — **not**
`auth.users` data and **not** the Supabase-managed `auth`/`storage` schemas
(the self-hosted stack creates those itself).

1. Get your cloud DB connection string: Supabase dashboard → **Project Settings
   → Database → Connection string → URI** (use the direct connection, port
   5432). It looks like:
   `postgresql://postgres:[YOUR-DB-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

2. Dump the schema (DDL only) of your non-system schemas into `schema/`:

   ```sh
   cd infra/supabase
   supabase db dump --db-url "postgresql://postgres:PWD@db.REF.supabase.co:5432/postgres" \
     -f schema/0001_init.sql
   ```

   `supabase db dump` excludes the managed `auth`/`storage`/`realtime` schemas
   by default and emits just your `public` (and any custom) schema — exactly
   what you want. It includes your tables, the RPC functions
   (`end_session`, `get_session_context`, `get_session_for_decryption`,
   `get_user_session`, `insert_protected_paths`, `report_encrypted_file`,
   `session_start_update`), constraints, and RLS policies.

3. (Optional) Capture reference/config data such as `subscription_plans`. Since
   `pg_dump` isn't installed locally, run it via the Postgres Docker image:

   ```sh
   docker run --rm postgres:15 pg_dump \
     "postgresql://postgres:PWD@db.REF.supabase.co:5432/postgres" \
     --data-only --no-owner --table=public.subscription_plans \
     > schema/0002_seed_subscription_plans.sql
   ```

4. **Review the dump.** Open `schema/0001_init.sql` and check for cloud-only
   artifacts that won't exist (or aren't needed) in self-hosting:
   - References to `auth.users` are fine (GoTrue creates that table).
   - Remove any `GRANT`/`ALTER ... OWNER TO` lines referencing cloud-only roles
     like `supabase_admin` if `psql` errors on them (the self-host roles are
     `postgres`, `anon`, `authenticated`, `service_role`).
   - Extensions: ensure any `CREATE EXTENSION` (e.g. `pgcrypto`, `uuid-ossp`)
     are available in `supabase/postgres` (they are, by default).

5. Commit `schema/*.sql` to the repo. This is now your portable source of truth.

---

## Phase 3 — Boot the stack locally and apply your schema

```sh
cd infra/supabase

# 1. Pull images and start everything (first run downloads ~8 images)
docker compose up -d

# 2. Wait until healthy
docker compose ps          # all services should be "healthy"/"running"

# 3. Apply your schema AFTER the stack is up (so auth.users exists)
sh apply-schema.sh
```

Verify:
- **Studio dashboard:** http://localhost:8000 (login with `DASHBOARD_USERNAME`
  / `DASHBOARD_PASSWORD` from `.env`). You should see your tables.
- **REST API / Kong gateway:** http://localhost:8000
- **Postgres directly:** `docker compose exec db psql -U postgres`

To wipe and start over: `docker compose down -v && rm -rf volumes/db/data volumes/storage`.

---

## Phase 4 — Re-wire the apps to the local instance

All keys/URLs come from `infra/supabase/.env`.

### Backend (`apps/backend/.env`)
```
SUPABASE_URL=http://localhost:8000
SUPABASE_KEY=<SERVICE_ROLE_KEY from infra/supabase/.env>   # legacy service_role JWT — most compatible with supabase-py
```
> Note: `SUPABASE_URL` points at the **Kong gateway** (port 8000), not Postgres.
> The backend's `service` and `auth` clients both use the service-role key, as
> today.

### Webapp (`apps/webapp/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<SUPABASE_PUBLISHABLE_KEY from infra/supabase/.env>
```

### Recreate the `company_logos` storage bucket
The backend uploads to a `company_logos` bucket. Create it once (Studio →
Storage → New bucket → name `company_logos`, public), or via SQL in a seed file:
```sql
insert into storage.buckets (id, name, public)
values ('company_logos', 'company_logos', true)
on conflict (id) do nothing;
```

### Google OAuth (self-hosted GoTrue)
Your cloud project handled the Google redirect; now your own GoTrue does.
1. In `infra/supabase/.env`, set under the OAuth section:
   ```
   GOOGLE_ENABLED=true
   GOOGLE_CLIENT_ID=<your Google client id>
   GOOGLE_SECRET=<your Google client secret>
   ```
   and uncomment the matching `GOTRUE_EXTERNAL_GOOGLE_*` lines in
   `docker-compose.yml` (the `auth` service).
2. Set `SITE_URL=http://localhost:3000` and add any extra callback URLs to
   `ADDITIONAL_REDIRECT_URLS`.
3. In the **Google Cloud Console** → OAuth client → Authorized redirect URIs,
   add: `http://localhost:8000/auth/v1/callback` (and your Railway URL later).
4. `docker compose up -d auth` to apply.

---

## Email / SMTP

GoTrue sends email for invites, password recovery, email confirmation, and
email-change. The stock self-host stack has **no mail server**, so those calls
fail until you point SMTP somewhere.

### Local development (Mailpit)
`docker-compose.mail.yml` adds **Mailpit**, a catcher that captures every
outgoing email (nothing is delivered) and shows it at **http://localhost:8025**.
It's wired up automatically by `start-local.sh` / on a fresh `.env`:

```
COMPOSE_FILE=docker-compose.yml:docker-compose.mail.yml
SMTP_HOST=supabase-mail
SMTP_PORT=1025
SMTP_USER=          # empty — Mailpit needs no auth, and GoTrue refuses to send
SMTP_PASS=          # credentials over an unencrypted connection ("unencrypted connection" error)
```

With `ENABLE_EMAIL_AUTOCONFIRM=true` (local default) signups skip the
confirmation email, but **invites and password recovery still send** — view them
in Mailpit.

### Production (real provider)
In prod, set `ENABLE_EMAIL_AUTOCONFIRM=false` and point SMTP at a transactional
email provider (Resend, Postmark, SendGrid, Mailgun, AWS SES, …). Do NOT include
the mail compose file. Set these as Railway env vars:

```
SMTP_HOST=smtp.resend.com        # provider's SMTP host
SMTP_PORT=465                    # 465 (implicit TLS) or 587 (STARTTLS)
SMTP_USER=resend                 # provider username / API-key user
SMTP_PASS=<provider api key>     # encrypted connection => credentials are fine
SMTP_ADMIN_EMAIL=no-reply@yourdomain.com
SMTP_SENDER_NAME=Annex
API_EXTERNAL_URL=https://<your-railway-domain>   # so email links point at prod
```

You must verify your sending domain (SPF/DKIM) with the provider, or mail lands
in spam / is rejected. Use port 465/587 so SMTP AUTH runs over TLS.

## Phase 5 — Deploy to Railway

The same stack runs on Railway. Key differences vs. localhost:

1. **Postgres with a persistent volume.** Either run the `db` service as a
   Railway service with an attached volume mounted at `/var/lib/postgresql/data`,
   or use Railway's managed Postgres and point the stack at it (managed Postgres
   means you maintain fewer containers, but you then load the Supabase DB
   bootstrap SQL — `volumes/db/*.sql` — into it manually).
2. **Per-service deploys.** Railway prefers one service per container. Deploy
   `db`, `auth`, `rest`, `storage`, `kong`, (and optionally `studio`) as
   separate services on a shared private network, or deploy the whole compose
   via a single service using Railway's Docker Compose support.
3. **Secrets.** Recreate every value from `.env` as Railway environment
   variables. **Generate fresh production secrets** — do not reuse local dev
   secrets. Re-run `utils/generate-keys.sh` + `utils/add-new-auth-keys.sh` for
   prod values.
4. **Public URLs.** Set `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL`, and
   `SITE_URL` to your Railway public domains. Add the Railway callback URL to
   Google OAuth authorized redirect URIs.
5. **Volumes that must persist:** `volumes/db/data` (Postgres) and
   `volumes/storage` (uploaded files). Everything else is reproducible.
6. Point `apps/backend` and `apps/webapp` production env at the Railway Kong URL
   + the production keys.

See https://supabase.com/docs/guides/self-hosting/docker for the canonical
reference, and `CONFIG.md` in this folder for every tunable.

---

## Service / port reference (local)

| Service   | Purpose                       | URL / port            |
|-----------|-------------------------------|-----------------------|
| Kong      | API gateway (use this as SUPABASE_URL) | http://localhost:8000 |
| Studio    | Admin dashboard               | http://localhost:8000 |
| Postgres  | Database                      | localhost:5432        |
| Supavisor | Connection pooler             | localhost:6543        |

All app traffic (REST, auth, storage) goes through **Kong on :8000**.
