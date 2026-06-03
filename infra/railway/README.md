# Deploying to Railway

This guide deploys Annex to [Railway](https://railway.app) with **zero
dependency on Supabase Cloud** — you run the open-source Supabase services
yourself.

> **Heads up — effort level.** Railway runs **one container per service** and
> has **no native `docker-compose`** support, so the Supabase stack must be
> split into individual services and its internal hostnames remapped to
> Railway's private DNS (`<service>.railway.internal`). This is the involved
> part. If you'd rather not wire ~5 Supabase services by hand, see
> [Simpler alternative](#simpler-alternative) at the bottom.

Everything below uses **fresh production secrets** — never reuse the local dev
values from `infra/supabase/.env`.

---

## Architecture (7 Railway services)

One Railway **project**, one **environment** (e.g. `production`). Services talk
over the private network; only the gateway and the two apps are public.

| Service     | Image / source                         | Public? | Volume |
|-------------|----------------------------------------|---------|--------|
| `db`        | `supabase/postgres:15.8.1.085`         | no      | ✅ `/var/lib/postgresql/data` |
| `auth`      | `supabase/gotrue:<pin>`                | no      | — |
| `rest`      | `postgrest/postgrest:<pin>`            | no      | — |
| `storage`   | `supabase/storage-api:<pin>`           | no      | ✅ `/var/lib/storage` (or use external S3/R2) |
| `kong`      | `kong:2.8.1` (API gateway)             | **yes** | — |
| `backend`   | this repo, root dir `apps/backend`     | **yes** | — |
| `webapp`    | this repo, root dir `apps/webapp`      | **yes** | — |

Pin image versions to whatever `infra/supabase/docker-compose.yml` currently
uses (search it for `image:`). Studio, Realtime, Analytics/Vector, Supavisor
(pooler), and Edge Functions are **intentionally omitted** — not needed to run
Annex. Run Studio locally pointed at prod if you need a dashboard.

---

## 1. Generate fresh production secrets

```sh
cd infra/supabase
sh utils/generate-keys.sh            # JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, POSTGRES_PASSWORD, …
sh utils/add-new-auth-keys.sh        # JWT_KEYS, JWT_JWKS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
```

Copy the printed values somewhere safe (Railway env, a password manager) — do
**not** write them into a committed file.

## 2. Networking model

Railway gives each service an internal hostname `<name>.railway.internal`. The
stock Supabase configs assume docker-compose names (`db`, `auth`, `rest`,
`storage`). So when a value points at another service, use the full internal
host. Examples:

- Postgres host (for auth/rest/storage): `db.railway.internal`
- Kong upstreams: `auth.railway.internal:9999`, `rest.railway.internal:3000`,
  `storage.railway.internal:5000`

Public URLs come from Railway's generated domains (or your custom domain):

- `KONG_PUBLIC_URL` = Kong's public domain, e.g. `https://api.yourapp.up.railway.app`
- `WEBAPP_PUBLIC_URL` = webapp's public domain

## 3. Database service (`db`)

- Image `supabase/postgres:15.8.1.085`, attach a **volume** at
  `/var/lib/postgresql/data` (this is what makes data survive redeploys).
- Env: `POSTGRES_PASSWORD`, `POSTGRES_DB=postgres`, `JWT_SECRET`, `JWT_EXP=3600`.
- After it's up, load the Supabase bootstrap SQL **and** the app schema. The
  bootstrap roles/extensions live in `infra/supabase/volumes/db/*.sql`
  (`roles.sql`, `jwt.sql`, `_supabase.sql`). Then apply
  `infra/supabase/schema/0001_init.sql`, `0002_*.sql`, `0003_*.sql`.
  Easiest: from your machine, `psql "$DATABASE_PUBLIC_URL" -f <file>` against the
  service's public connection string (disable the public proxy afterward), or
  run them via a one-off Railway shell.

> The `supabase/postgres` image already creates the `anon`, `authenticated`,
> `service_role`, `supabase_auth_admin`, `supabase_storage_admin` roles and the
> needed extensions on first boot — which is why we use it instead of Railway's
> managed Postgres.

## 4. Auth service (`auth`)

Image `supabase/gotrue:<pin>`. Key env (see the `auth:` block in
`docker-compose.yml` for the full list):

```
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
API_EXTERNAL_URL=${KONG_PUBLIC_URL}
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@db.railway.internal:5432/postgres
GOTRUE_SITE_URL=${WEBAPP_PUBLIC_URL}
GOTRUE_JWT_SECRET=${JWT_SECRET}
GOTRUE_JWT_KEYS=${JWT_KEYS}
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_AUD=authenticated
GOTRUE_MAILER_AUTOCONFIRM=false          # real email confirmation in prod
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
# SMTP (see RUNBOOK "Email / SMTP") — use a real provider, port 465/587:
GOTRUE_SMTP_HOST=...  GOTRUE_SMTP_PORT=587  GOTRUE_SMTP_USER=...  GOTRUE_SMTP_PASS=...
GOTRUE_SMTP_ADMIN_EMAIL=no-reply@yourdomain.com  GOTRUE_SMTP_SENDER_NAME=Annex
# Google OAuth (optional):
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=...
GOTRUE_EXTERNAL_GOOGLE_SECRET=...
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=${KONG_PUBLIC_URL}/auth/v1/callback
```

## 5. REST service (`rest`)

Image `postgrest/postgrest:<pin>`:

```
PGRST_DB_URI=postgres://authenticator:${POSTGRES_PASSWORD}@db.railway.internal:5432/postgres
PGRST_DB_SCHEMAS=public,storage,graphql_public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=${JWT_SECRET}
PGRST_APP_SETTINGS_JWT_EXP=3600
```

## 6. Storage service (`storage`)

Image `supabase/storage-api:<pin>`. Use the `file` backend with a volume at
`/var/lib/storage`, or point at external S3/Cloudflare R2 (recommended for
durability). Key env (see `storage:` block for the full list):

```
ANON_KEY=${ANON_KEY}
SERVICE_KEY=${SERVICE_ROLE_KEY}
POSTGREST_URL=http://rest.railway.internal:3000
PGRST_JWT_SECRET=${JWT_SECRET}
DATABASE_URL=postgres://supabase_storage_admin:${POSTGRES_PASSWORD}@db.railway.internal:5432/postgres
FILE_SIZE_LIMIT=52428800
STORAGE_BACKEND=file
FILE_STORAGE_BACKEND_PATH=/var/lib/storage
TENANT_ID=stub
REGION=stub
GLOBAL_S3_BUCKET=stub
```

Recreate the `company_logos` bucket once (see RUNBOOK Phase 4).

## 7. Gateway service (`kong`)

Image `kong:2.8.1`. Kong needs a declarative config that routes `/auth/v1`,
`/rest/v1`, `/storage/v1` to the internal services. The stock
`infra/supabase/volumes/api/kong.yml` uses compose hostnames — **copy it to a
Railway-specific config and replace the upstream hosts** with
`auth.railway.internal`, `rest.railway.internal`, `storage.railway.internal`,
then mount/point Kong at it via `KONG_DECLARATIVE_CONFIG`. Also set the standard
Kong env (`KONG_DATABASE=off`, the `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_KEY`
used by the config, etc. — see the `kong:` block). Expose Kong publicly; this is
your `KONG_PUBLIC_URL`.

## 8. App services (`backend`, `webapp`)

These are the easy ones — deploy from this monorepo, set the **Root Directory**
per service:

- **backend** → root `apps/backend`. Railway auto-detects Python + the
  `Procfile` (`gunicorn … --bind 0.0.0.0:$PORT`). Env:
  ```
  SUPABASE_URL=${KONG_PUBLIC_URL}
  SUPABASE_KEY=${SUPABASE_SECRET_KEY}
  RANDOM_AES_SEED=<fresh 32-byte hex>     # python -c "import secrets;print(secrets.token_hex(32))"
  ENVIRONMENT=PRODUCTION
  CORS_ORIGINS=${WEBAPP_PUBLIC_URL}
  WEBAPP_URL=${WEBAPP_PUBLIC_URL}
  ```
- **webapp** → root `apps/webapp`. Nixpacks runs `next build` then `next start`
  (binds `$PORT`). Env:
  ```
  NEXT_PUBLIC_SUPABASE_URL=${KONG_PUBLIC_URL}
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
  NEXT_PUBLIC_API_URL=<backend public domain>
  ```

The desktop app is a client — not deployed. Point its `src-tauri/.env`
`SUPABASE_URL`/`API_URL` at the prod domains and update the Tauri CSP
(`tauri.conf.json`) to allow the prod Supabase + API origins before building
release binaries.

## 9. Deploy order & verification

1. `db` (load bootstrap SQL + schema) → 2. `rest`, `auth`, `storage` →
3. `kong` → 4. `backend`, `webapp`.
2. Verify: `curl $KONG_PUBLIC_URL/rest/v1/ -H "apikey: $SERVICE_ROLE_KEY"` → 200.
3. Add `${KONG_PUBLIC_URL}/auth/v1/callback` to Google Cloud Console authorized
   redirect URIs.
4. Sign up through the webapp; confirm the email arrives (real SMTP) and the
   `handle_new_user` trigger created the org/membership rows.

## Secrets & safety checklist

- Fresh secrets for prod (never the dev ones).
- `GOTRUE_MAILER_AUTOCONFIRM=false` + real SMTP.
- Only `kong`, `backend`, `webapp` are public; `db`/`auth`/`rest`/`storage`
  stay private.
- Volumes attached to `db` (and `storage` if using the file backend).
- Rotate the Google OAuth client secret if it was ever exposed.

---

## Simpler alternative

Full Supabase self-host is genuinely heavy on a per-service PaaS. If the wiring
above is more than you want:

- Run the **Supabase stack on a single Docker host** (any small VPS, or a
  Railway service backed by a Docker host) where the existing
  `docker compose up -d` works **as-is** — no hostname remapping, no kong.yml
  edits. Then deploy only **backend** and **webapp** on Railway pointed at that
  host's public Kong URL.
- This keeps the "zero Supabase-cloud dependency" goal while avoiding the
  multi-service decomposition. The app deploys (Procfile / Nixpacks) are
  identical.
