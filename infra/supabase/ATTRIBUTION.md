# Attribution

The Docker stack in this directory (`docker-compose*.yml`, `volumes/`, `utils/`,
`*.sh`, and related configuration) is **derived from the official Supabase
self-hosting setup**:

- Source: https://github.com/supabase/supabase (the `docker/` directory)
- Copyright © Supabase, Inc. and contributors
- License: **Apache License 2.0** — https://www.apache.org/licenses/LICENSE-2.0

Local modifications for this project include: a de-Stripe'd application schema
under `schema/`, `apply-schema.sh`, the Mailpit dev mail-catcher
(`docker-compose.mail.yml`), `RUNBOOK.md`, and adjusted ports/defaults in
`.env.example`.

The container images pulled by the compose files (e.g. `supabase/postgres`,
`supabase/gotrue`, `postgrest/postgrest`, `supabase/storage-api`, `kong`,
`axllent/mailpit`) are distributed under their own respective licenses by their
respective authors.

The rest of this repository (the `apps/` and `packages/` source code) is
licensed under the MIT License — see the root [LICENSE](../../LICENSE).
