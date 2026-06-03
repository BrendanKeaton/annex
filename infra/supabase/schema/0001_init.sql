


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgmq";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."audit_action" AS ENUM (
    'session_started',
    'session_ended',
    'session_aborted',
    'file_encrypted',
    'file_decrypted',
    'file_decrypt_failed',
    'path_added',
    'path_removed',
    'org_created',
    'org_deleted',
    'member_invited',
    'member_removed',
    'member_role_changed',
    'mfa_enabled',
    'mfa_disabled',
    'recovery_code_used',
    'subscription_changed'
);


ALTER TYPE "public"."audit_action" OWNER TO "postgres";


CREATE TYPE "public"."invite_status" AS ENUM (
    'pending',
    'accepted',
    'revoked',
    'expired'
);


ALTER TYPE "public"."invite_status" OWNER TO "postgres";


CREATE TYPE "public"."org_member_role" AS ENUM (
    'owner',
    'admin',
    'member'
);


ALTER TYPE "public"."org_member_role" OWNER TO "postgres";


CREATE TYPE "public"."path_type" AS ENUM (
    'file',
    'directory'
);


ALTER TYPE "public"."path_type" OWNER TO "postgres";


CREATE TYPE "public"."session_file_status" AS ENUM (
    'encrypted',
    'decrypted',
    'failed'
);


ALTER TYPE "public"."session_file_status" OWNER TO "postgres";


CREATE TYPE "public"."session_status" AS ENUM (
    'active',
    'ended',
    'aborted'
);


ALTER TYPE "public"."session_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_ai_file_vault_schema"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$
BEGIN

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "moddatetime"; -- auto updated_at (Supabase has this)


DO $enum$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_member_role') THEN
        CREATE TYPE org_member_role AS ENUM ('owner', 'admin', 'member');
    END IF;
END $enum$;

DO $enum$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'path_type') THEN
        CREATE TYPE path_type AS ENUM ('file', 'directory');
    END IF;
END $enum$;

DO $enum$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_status') THEN
        CREATE TYPE session_status AS ENUM ('active', 'ended', 'aborted');
    END IF;
END $enum$;

DO $enum$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_file_status') THEN
        CREATE TYPE session_file_status AS ENUM ('encrypted', 'decrypted', 'failed');
    END IF;
END $enum$;

DO $enum$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN
        CREATE TYPE audit_action AS ENUM (
            'session_started',
            'session_ended',
            'session_aborted',
            'file_encrypted',
            'file_decrypted',
            'file_decrypt_failed',
            'path_added',
            'path_removed',
            'org_created',
            'org_deleted',
            'member_invited',
            'member_removed',
            'member_role_changed',
            'mfa_enabled',
            'mfa_disabled',
            'recovery_code_used',
            'subscription_changed'
        );
    END IF;
END $enum$;



CREATE TABLE IF NOT EXISTS subscription_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,
    max_users       INT  NOT NULL CHECK (max_users > 0),
    max_files_stored INT NOT NULL CHECK (max_files_stored > 0),   -- per-org limit
    price_monthly   NUMERIC(10,2) NOT NULL CHECK (price_monthly >= 0),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT NOT NULL,
    subscription_plan_id  UUID NOT NULL REFERENCES subscription_plans(id),
    current_files_stored  INT  NOT NULL DEFAULT 0 CHECK (current_files_stored >= 0),
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id      UUID NOT NULL REFERENCES organizations(id),
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role      org_member_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, org_id)   -- a user can only have one role per org
);

CREATE TABLE IF NOT EXISTS protected_paths (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    path       TEXT NOT NULL,
    path_type  path_type NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, org_id, path)   -- prevent duplicate path registrations
);

CREATE TABLE IF NOT EXISTS sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status              session_status NOT NULL DEFAULT 'active',
    recovery_code_hash  TEXT,                          -- bcrypt/argon2 hash
    recovery_code_used_at TIMESTAMPTZ,                 -- when recovery was exercised
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at            TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS session_files (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id         UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    original_path      TEXT NOT NULL,
    encrypted_filename TEXT NOT NULL,
    checksum_sha256    TEXT NOT NULL,                   -- hex-encoded SHA-256
    aes_key_encrypted  BYTEA NOT NULL,                 -- raw encrypted key blob
    status             session_file_status NOT NULL DEFAULT 'encrypted',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    decrypted_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,  -- nullable: system events
    org_id     UUID REFERENCES organizations(id) ON DELETE SET NULL,
    action     audit_action NOT NULL,
    metadata   JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);



CREATE INDEX IF NOT EXISTS idx_organizations_sub_plan
    ON organizations (subscription_plan_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_users_org
    ON users (org_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_org_members_org_role
    ON organization_members (org_id, role);

CREATE INDEX IF NOT EXISTS idx_protected_paths_org
    ON protected_paths (org_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user_org_status
    ON sessions (user_id, org_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_sessions_org_started
    ON sessions (org_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_files_session
    ON session_files (session_id);

CREATE INDEX IF NOT EXISTS idx_session_files_user_encrypted
    ON session_files (user_id, org_id)
    WHERE status = 'encrypted';

CREATE INDEX IF NOT EXISTS idx_session_files_enc_filename
    ON session_files (encrypted_filename);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
    ON audit_log (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created
    ON audit_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
    ON audit_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_metadata
    ON audit_log USING GIN (metadata);



ALTER TABLE subscription_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_paths       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log             ENABLE ROW LEVEL SECURITY;

ALTER TABLE subscription_plans    FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations         FORCE ROW LEVEL SECURITY;
ALTER TABLE users                 FORCE ROW LEVEL SECURITY;
ALTER TABLE organization_members  FORCE ROW LEVEL SECURITY;
ALTER TABLE protected_paths       FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions              FORCE ROW LEVEL SECURITY;
ALTER TABLE session_files         FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log             FORCE ROW LEVEL SECURITY;




DROP TRIGGER IF EXISTS trg_subscription_plans_updated ON subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

DROP TRIGGER IF EXISTS trg_organizations_updated ON organizations;
CREATE TRIGGER trg_organizations_updated
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

DROP TRIGGER IF EXISTS trg_org_members_updated ON organization_members;
CREATE TRIGGER trg_org_members_updated
    BEFORE UPDATE ON organization_members
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);



CREATE OR REPLACE FUNCTION fn_update_org_file_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
    target_org_id UUID;
BEGIN
    -- Determine which org_id to recount
    IF TG_OP = 'DELETE' THEN
        target_org_id := OLD.org_id;
    ELSE
        target_org_id := NEW.org_id;
    END IF;

    UPDATE organizations
       SET current_files_stored = (
           SELECT COUNT(*)
             FROM protected_paths
            WHERE org_id = target_org_id
       )
     WHERE id = target_org_id;

    -- Handle org change (row moved between orgs on UPDATE)
    IF TG_OP = 'UPDATE' AND OLD.org_id IS DISTINCT FROM NEW.org_id THEN
        UPDATE organizations
           SET current_files_stored = (
               SELECT COUNT(*)
                 FROM protected_paths
                WHERE org_id = OLD.org_id
           )
         WHERE id = OLD.org_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_protected_paths_count_insert ON protected_paths;
CREATE TRIGGER trg_protected_paths_count_insert
    AFTER INSERT ON protected_paths
    FOR EACH ROW EXECUTE FUNCTION fn_update_org_file_count();

DROP TRIGGER IF EXISTS trg_protected_paths_count_delete ON protected_paths;
CREATE TRIGGER trg_protected_paths_count_delete
    AFTER DELETE ON protected_paths
    FOR EACH ROW EXECUTE FUNCTION fn_update_org_file_count();

DROP TRIGGER IF EXISTS trg_protected_paths_count_update ON protected_paths;
CREATE TRIGGER trg_protected_paths_count_update
    AFTER UPDATE ON protected_paths
    FOR EACH ROW EXECUTE FUNCTION fn_update_org_file_count();


CREATE OR REPLACE FUNCTION fn_check_org_file_quota(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $fn$
DECLARE
    v_current INT;
    v_max     INT;
BEGIN
    SELECT o.current_files_stored, sp.max_files_stored
      INTO v_current, v_max
      FROM organizations o
      JOIN subscription_plans sp ON sp.id = o.subscription_plan_id
     WHERE o.id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Organization % not found', p_org_id;
    END IF;

    RETURN v_current < v_max;
END;
$fn$;


RAISE NOTICE 'AI File Vault schema created successfully.';

END;
$_$;


ALTER FUNCTION "public"."create_ai_file_vault_schema"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_session"("p_session_id" "uuid", "p_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
  UPDATE sessions
  SET status = p_status::session_status,
      ended_at = now()
  WHERE id = p_session_id
    AND user_id = p_user_id;

  UPDATE session_files
  SET status = 'decrypted'::session_file_status,
      decrypted_at = now()
  WHERE session_id = p_session_id;
END;$$;


ALTER FUNCTION "public"."end_session"("p_session_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_session"("p_session_id" "uuid", "p_status" "text", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE sessions
  SET status = p_status::session_status,
      ended_at = now()
  WHERE id = p_session_id
    AND user_id = p_user_id;

  UPDATE session_files
  SET status = 'decrypted'::session_file_status,
      decrypted_at = now()
  WHERE session_id = p_session_id;
END;
$$;


ALTER FUNCTION "public"."end_session"("p_session_id" "uuid", "p_status" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_invites"() RETURNS "void"
    LANGUAGE "sql"
    AS $$
  UPDATE public.organization_invites
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();
$$;


ALTER FUNCTION "public"."expire_stale_invites"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_check_org_file_quota"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    v_current INT;
    v_max     INT;
BEGIN
    SELECT o.current_files_stored, sp.max_files_stored
      INTO v_current, v_max
      FROM organizations o
      JOIN subscription_plans sp ON sp.id = o.subscription_plan_id
     WHERE o.id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Organization % not found', p_org_id;
    END IF;

    RETURN v_current < v_max;
END;
$$;


ALTER FUNCTION "public"."fn_check_org_file_quota"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_update_org_file_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    target_org_id UUID;
BEGIN
    -- Determine which org_id to recount
    IF TG_OP = 'DELETE' THEN
        target_org_id := OLD.org_id;
    ELSE
        target_org_id := NEW.org_id;
    END IF;

    UPDATE organizations
       SET current_files_stored = (
           SELECT COUNT(*)
             FROM protected_paths
            WHERE org_id = target_org_id
       )
     WHERE id = target_org_id;

    -- Handle org change (row moved between orgs on UPDATE)
    IF TG_OP = 'UPDATE' AND OLD.org_id IS DISTINCT FROM NEW.org_id THEN
        UPDATE organizations
           SET current_files_stored = (
               SELECT COUNT(*)
                 FROM protected_paths
                WHERE org_id = OLD.org_id
           )
         WHERE id = OLD.org_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."fn_update_org_file_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_session_context"("p_user_id" "uuid", "p_file_count" bigint, "p_total_size_kb" bigint, "p_est_encryption_time_ms" bigint) RETURNS TABLE("session_id" "uuid", "daily_session_count" integer, "random_seed" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_session_id uuid;
  v_seed_index int;
  v_session_count integer;
  v_seed text;
  v_existing_session uuid;
BEGIN
  -- Get user context
  SELECT
    u.daily_session_count,
    floor(random() * array_length(u.key_seeds, 1) + 1)::int
  INTO v_session_count, v_seed_index
  FROM public.users u
  WHERE u.id = p_user_id
    AND u.is_active = true
    AND u.deleted_at IS NULL;

  IF v_session_count IS NULL THEN
    RAISE EXCEPTION 'User not found or inactive: %', p_user_id;
  END IF;

  -- Check for existing active session
  SELECT s.id INTO v_existing_session
  FROM public.sessions s
  WHERE s.user_id = p_user_id
    AND s.status = 'active'::session_status
  LIMIT 1;

  IF v_existing_session IS NOT NULL THEN
    RAISE EXCEPTION 'Active session already exists: %', v_existing_session;
  END IF;

  -- Get the seed from the computed index
  SELECT u.key_seeds[v_seed_index]
  INTO v_seed
  FROM public.users u
  WHERE u.id = p_user_id;

  -- Create the session
  INSERT INTO public.sessions (
    user_id,
    status,
    file_count,
    total_size_enc_kb,
    est_encryption_time_ms
  ) VALUES (
    p_user_id,
    'active'::session_status,
    p_file_count,
    p_total_size_kb,
    p_est_encryption_time_ms
  )
  RETURNING id INTO v_session_id;

  -- Increment daily session count
  UPDATE public.users
  SET daily_session_count = public.users.daily_session_count + 1,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN QUERY
  SELECT v_session_id, v_session_count, v_seed;
END;
$$;


ALTER FUNCTION "public"."get_session_context"("p_user_id" "uuid", "p_file_count" bigint, "p_total_size_kb" bigint, "p_est_encryption_time_ms" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_session_for_decryption"("p_session_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  v_aes_key text;
  v_files jsonb;
BEGIN
  SELECT aes_key INTO v_aes_key
  FROM sessions
  WHERE id = p_session_id
    AND user_id = p_user_id;

  IF v_aes_key IS NULL THEN
    RAISE EXCEPTION 'Session not found or has no AES key';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'original_path', original_path,
    'encrypted_filename', encrypted_filename,
    'checksum_sha256', checksum_sha256,
    'format_version', format_version,
    'status', status
  )), '[]'::jsonb)
  INTO v_files
  FROM session_files
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'aes_key', v_aes_key,
    'files', v_files
  );
END;$$;


ALTER FUNCTION "public"."get_session_for_decryption"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_session_for_decryption"("p_session_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_aes_key text;
  v_files jsonb;
BEGIN
  SELECT aes_key INTO v_aes_key
  FROM sessions
  WHERE id = p_session_id
    AND user_id = p_user_id;

  IF v_aes_key IS NULL THEN
    RAISE EXCEPTION 'Session not found or has no AES key';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'original_path', original_path,
    'encrypted_filename', encrypted_filename,
    'checksum_sha256', checksum_sha256,
    'format_version', format_version,
    'status', status
  )), '[]'::jsonb)
  INTO v_files
  FROM session_files
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'aes_key', v_aes_key,
    'files', v_files
  );
END;
$$;


ALTER FUNCTION "public"."get_session_for_decryption"("p_session_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_session"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$SELECT jsonb_build_object(
    'session_count',   u.daily_session_count,
    'usage',           CASE WHEN sp.max_files_stored > 0
                            THEN round(o.current_files_stored::numeric / sp.max_files_stored * 100)
                            ELSE 0
                       END,
    'current_file_count', o.current_files_stored,
    'max_file_count',  sp.max_files_stored,
    'org_name',        o.name,
    'logo_path',       o.logo_path,
    'mid_process',     COALESCE(
      (SELECT
        CASE
          WHEN s.id IS NULL THEN false
          WHEN s.file_count = (
            SELECT count(*)
            FROM session_files sf
            WHERE sf.session_id = s.id
              AND sf.status = 'encrypted'
          ) THEN false
          ELSE true
        END
       FROM sessions s
       WHERE s.user_id = p_user_id
         AND s.status = 'active'
       ORDER BY s.started_at DESC
       LIMIT 1),
      false
    ),
    'protected_paths', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'path',       pp.path,
          'file_type',  pp.file_type,
          'file_size',  pp.file_size,
          'created_at', to_char(pp.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')
       ))
       FROM protected_paths pp
       WHERE pp.user_id = p_user_id),
      '[]'::jsonb
    ),
    'session_history', COALESCE(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'id',                        s.id,
            'status',                    s.status,
            'started_at',                to_char(s.started_at,  'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'),
            'ended_at',                  to_char(s.ended_at,    'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'),
            'file_count',                s.file_count,
            'est_encryption_time_ms',    s.est_encryption_time_ms,
            'actual_encryption_time_ms', s.actual_encryption_time_ms,
            'total_size_enc_kb',         s.total_size_enc_kb,
            'failure_message',           s.failure_message
          ) ORDER BY s.started_at DESC
       )
       FROM sessions s
       WHERE s.user_id = p_user_id),
      '[]'::jsonb
    )
  )
  FROM users u
  JOIN organizations o  ON o.id = u.org_id
  JOIN subscription_plans sp ON sp.id = o.subscription_plan_id
  WHERE u.id = p_user_id;$$;


ALTER FUNCTION "public"."get_user_session"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  new_org_id uuid;
  default_plan_id uuid;
BEGIN
  -- Get the default/free subscription plan
  SELECT id INTO default_plan_id
  FROM public.subscription_plans
  WHERE name = 'free'
  LIMIT 1;

  -- Create a personal org for the user
  INSERT INTO public.organizations (name, subscription_plan_id)
  VALUES ('Personal', default_plan_id)
  RETURNING id INTO new_org_id;

  -- Create the public user linked to that org
  INSERT INTO public.users (id, org_id)
  VALUES (NEW.id, new_org_id);

  -- Make them the owner of the org
  INSERT INTO public.organization_members (user_id, org_id, role)
  VALUES (NEW.id, new_org_id, 'owner');

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_protected_paths"("p_user_id" "uuid", "p_items" "jsonb") RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_org_id uuid;
    v_current_files_stored integer;
    v_max_files_stored integer;
    v_new_file_count integer;
BEGIN

    -- Get org_id for the user
    SELECT org_id
    INTO v_org_id
    FROM public.users
    WHERE id = p_user_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'User does not belong to an organization';
    END IF;

    -- Get current files stored and the subscription limit
    SELECT o.current_files_stored, sp.max_files_stored
    INTO v_current_files_stored, v_max_files_stored
    FROM public.organizations o
    JOIN public.subscription_plans sp ON sp.id = o.subscription_plan_id
    WHERE o.id = v_org_id;

    -- Count how many genuinely new files are being added (exclude conflicts that already exist)
    SELECT count(*)
    INTO v_new_file_count
    FROM jsonb_array_elements(p_items) AS item
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.protected_paths pp
        WHERE pp.user_id = p_user_id
          AND pp.path = item->>'path'
    );

    -- Enforce the subscription limit
    IF v_current_files_stored + v_new_file_count > v_max_files_stored THEN
        RAISE EXCEPTION 'File limit exceeded. Current: %, Adding: %, Max: %',
            v_current_files_stored, v_new_file_count, v_max_files_stored;
    END IF;

    -- Insert all records
    INSERT INTO public.protected_paths (
        user_id,
        org_id,
        path,
        file_type,
        file_size
    )
    SELECT
        p_user_id,
        v_org_id,
        item->>'path',
        item->>'file_type',
        (item->>'file_size')::bigint
    FROM jsonb_array_elements(p_items) AS item
    ON CONFLICT (user_id, path)
    DO UPDATE SET
        file_size = EXCLUDED.file_size;

    -- Get the updated current files stored
    SELECT current_files_stored
    INTO v_current_files_stored
    FROM public.organizations
    WHERE id = v_org_id;

    RETURN v_current_files_stored;

END;
$$;


ALTER FUNCTION "public"."insert_protected_paths"("p_user_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_encrypted_file"("p_session_id" "uuid", "p_user_id" "uuid", "p_original_path" "text", "p_encrypted_filename" "text", "p_checksum_sha256" "text", "p_format_version" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM users WHERE id = p_user_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User not found or has no org';
  END IF;

  INSERT INTO session_files (
    session_id, user_id, org_id,
    original_path, encrypted_filename, checksum_sha256, format_version, status
  )
  VALUES (
    p_session_id,
    p_user_id,
    v_org_id,
    p_original_path,
    p_encrypted_filename,
    p_checksum_sha256,
    p_format_version,
    'encrypted'
  );
END;
$$;


ALTER FUNCTION "public"."report_encrypted_file"("p_session_id" "uuid", "p_user_id" "uuid", "p_original_path" "text", "p_encrypted_filename" "text", "p_checksum_sha256" "text", "p_format_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_encrypted_file"("p_session_id" "uuid", "p_user_id" "uuid", "p_original_path" "text", "p_encrypted_filename" "text", "p_checksum_sha256" "text", "p_format_version" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT 'encrypted'::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM users WHERE id = p_user_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User not found or has no org';
  END IF;

  INSERT INTO session_files (
    session_id, user_id, org_id,
    original_path, encrypted_filename, checksum_sha256, format_version, status
  )
  VALUES (
    p_session_id,
    p_user_id,
    v_org_id,
    p_original_path,
    p_encrypted_filename,
    p_checksum_sha256,
    p_format_version,
    p_status::session_file_status
  )
  ON CONFLICT (session_id, original_path)
  DO UPDATE SET
    status = EXCLUDED.status::session_file_status,
    encrypted_filename = EXCLUDED.encrypted_filename,
    checksum_sha256 = EXCLUDED.checksum_sha256,
    format_version = EXCLUDED.format_version;
END;
$$;


ALTER FUNCTION "public"."report_encrypted_file"("p_session_id" "uuid", "p_user_id" "uuid", "p_original_path" "text", "p_encrypted_filename" "text", "p_checksum_sha256" "text", "p_format_version" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."session_start_update"("p_session_id" "uuid", "p_actual_time_ms" integer, "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE sessions
  SET actual_encryption_time_ms = p_actual_time_ms
  WHERE id = p_session_id
    AND user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."session_start_update"("p_session_id" "uuid", "p_actual_time_ms" integer, "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."wipe_all_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- 1. Wipe public tables in dependency order (skip subscription_plans)
  DELETE FROM public.audit_log;
  DELETE FROM public.session_files;
  DELETE FROM public.sessions;
  DELETE FROM public.protected_paths;
  DELETE FROM public.organization_members;
  DELETE FROM public.users;
  DELETE FROM public.organizations;

  -- 2. Wipe auth schema in dependency order
  DELETE FROM auth.mfa_amr_claims;
  DELETE FROM auth.mfa_challenges;
  DELETE FROM auth.mfa_factors;
  DELETE FROM auth.refresh_tokens;
  DELETE FROM auth.sessions;
  DELETE FROM auth.identities;
  DELETE FROM auth.one_time_tokens;
  DELETE FROM auth.users;
END;
$$;


ALTER FUNCTION "public"."wipe_all_data"() OWNER TO "postgres";


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "org_id" "uuid",
    "action" "public"."audit_action" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "public"."invite_status" DEFAULT 'pending'::"public"."invite_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone
);


ALTER TABLE "public"."organization_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role" "public"."org_member_role" DEFAULT 'member'::"public"."org_member_role" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "subscription_plan_id" "uuid",
    "current_files_stored" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logo_path" "text",
    CONSTRAINT "organizations_current_files_stored_check" CHECK (("current_files_stored" >= 0))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."protected_paths" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "file_size" bigint DEFAULT '0'::bigint,
    "file_type" "text" DEFAULT 'unknown'::"text" NOT NULL,
    CONSTRAINT "protected_paths_file_size_check" CHECK (("file_size" >= 0))
);


ALTER TABLE "public"."protected_paths" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "original_path" "text" NOT NULL,
    "encrypted_filename" "text" NOT NULL,
    "checksum_sha256" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decrypted_at" timestamp with time zone,
    "status" "public"."session_file_status",
    "failure_message" "text",
    "format_version" "text"
);


ALTER TABLE "public"."session_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "public"."session_status" DEFAULT 'active'::"public"."session_status" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "aes_key" "text",
    "file_count" bigint NOT NULL,
    "est_encryption_time_ms" bigint DEFAULT '0'::bigint NOT NULL,
    "total_size_enc_kb" bigint,
    "actual_encryption_time_ms" bigint DEFAULT '0'::bigint NOT NULL,
    "failure_message" "text"
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "max_users" integer NOT NULL,
    "max_files_stored" integer NOT NULL,
    "price_monthly" numeric(10,2) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "code" "text" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "subscription_plans_code_check" CHECK (("length"("code") <= 16)),
    CONSTRAINT "subscription_plans_max_files_stored_check" CHECK (("max_files_stored" > 0)),
    CONSTRAINT "subscription_plans_max_users_check" CHECK (("max_users" > 0)),
    CONSTRAINT "subscription_plans_price_monthly_check" CHECK (("price_monthly" >= (0)::numeric))
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "org_id" "uuid",
    "mfa_enabled" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "daily_session_count" integer DEFAULT 0 NOT NULL,
    "key_seeds" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "pin" "text",
    CONSTRAINT "chk_key_seeds_length" CHECK (("array_length"("key_seeds", 1) = 6))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invites"
    ADD CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_org_id_key" UNIQUE ("user_id", "org_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."protected_paths"
    ADD CONSTRAINT "protected_paths_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."protected_paths"
    ADD CONSTRAINT "protected_paths_user_id_org_id_path_key" UNIQUE ("user_id", "org_id", "path");



ALTER TABLE ONLY "public"."protected_paths"
    ADD CONSTRAINT "protected_paths_user_path_unique" UNIQUE ("user_id", "path");



ALTER TABLE ONLY "public"."session_files"
    ADD CONSTRAINT "session_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audit_log_action_created" ON "public"."audit_log" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "idx_audit_log_metadata" ON "public"."audit_log" USING "gin" ("metadata");



CREATE INDEX "idx_audit_log_org_created" ON "public"."audit_log" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_audit_log_user_created" ON "public"."audit_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_org_members_org_role" ON "public"."organization_members" USING "btree" ("org_id", "role");



CREATE INDEX "idx_organization_invites_email_status" ON "public"."organization_invites" USING "btree" ("email", "status") WHERE ("status" = 'pending'::"public"."invite_status");



CREATE INDEX "idx_organization_invites_org_id" ON "public"."organization_invites" USING "btree" ("org_id");



CREATE INDEX "idx_organizations_sub_plan" ON "public"."organizations" USING "btree" ("subscription_plan_id") WHERE ("is_active" = true);



CREATE INDEX "idx_protected_paths_org" ON "public"."protected_paths" USING "btree" ("org_id");



CREATE INDEX "idx_session_files_enc_filename" ON "public"."session_files" USING "btree" ("encrypted_filename");



CREATE INDEX "idx_session_files_session" ON "public"."session_files" USING "btree" ("session_id");



CREATE INDEX "idx_users_org" ON "public"."users" USING "btree" ("org_id") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "uq_session_files_session_path" ON "public"."session_files" USING "btree" ("session_id", "original_path");



CREATE OR REPLACE TRIGGER "trg_org_members_updated" BEFORE UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "trg_organizations_updated" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "trg_protected_paths_count_delete" AFTER DELETE ON "public"."protected_paths" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_org_file_count"();



CREATE OR REPLACE TRIGGER "trg_protected_paths_count_insert" AFTER INSERT ON "public"."protected_paths" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_org_file_count"();



CREATE OR REPLACE TRIGGER "trg_protected_paths_count_update" AFTER UPDATE ON "public"."protected_paths" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_org_file_count"();



CREATE OR REPLACE TRIGGER "trg_subscription_plans_updated" BEFORE UPDATE ON "public"."subscription_plans" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "trg_users_updated" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."moddatetime"('updated_at');



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_invites"
    ADD CONSTRAINT "organization_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."organization_invites"
    ADD CONSTRAINT "organization_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_subscription_plan_id_fkey" FOREIGN KEY ("subscription_plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."protected_paths"
    ADD CONSTRAINT "protected_paths_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."protected_paths"
    ADD CONSTRAINT "protected_paths_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_files"
    ADD CONSTRAINT "session_files_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_files"
    ADD CONSTRAINT "session_files_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_files"
    ADD CONSTRAINT "session_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."protected_paths" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."create_ai_file_vault_schema"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_ai_file_vault_schema"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_ai_file_vault_schema"() TO "service_role";



GRANT ALL ON FUNCTION "public"."end_session"("p_session_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."end_session"("p_session_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_session"("p_session_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."end_session"("p_session_id" "uuid", "p_status" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."end_session"("p_session_id" "uuid", "p_status" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_session"("p_session_id" "uuid", "p_status" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_stale_invites"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_stale_invites"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_stale_invites"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_check_org_file_quota"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_check_org_file_quota"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_check_org_file_quota"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_update_org_file_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_update_org_file_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_update_org_file_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_session_context"("p_user_id" "uuid", "p_file_count" bigint, "p_total_size_kb" bigint, "p_est_encryption_time_ms" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_session_context"("p_user_id" "uuid", "p_file_count" bigint, "p_total_size_kb" bigint, "p_est_encryption_time_ms" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_session_context"("p_user_id" "uuid", "p_file_count" bigint, "p_total_size_kb" bigint, "p_est_encryption_time_ms" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_session_for_decryption"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_session_for_decryption"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_session_for_decryption"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_session_for_decryption"("p_session_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_session_for_decryption"("p_session_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_session_for_decryption"("p_session_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_session"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_session"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_session"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_protected_paths"("p_user_id" "uuid", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_protected_paths"("p_user_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_protected_paths"("p_user_id" "uuid", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."moddatetime"() TO "postgres";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "anon";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."moddatetime"() TO "service_role";



GRANT ALL ON FUNCTION "public"."report_encrypted_file"("p_session_id" "uuid", "p_user_id" "uuid", "p_original_path" "text", "p_encrypted_filename" "text", "p_checksum_sha256" "text", "p_format_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."report_encrypted_file"("p_session_id" "uuid", "p_user_id" "uuid", "p_original_path" "text", "p_encrypted_filename" "text", "p_checksum_sha256" "text", "p_format_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_encrypted_file"("p_session_id" "uuid", "p_user_id" "uuid", "p_original_path" "text", "p_encrypted_filename" "text", "p_checksum_sha256" "text", "p_format_version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."report_encrypted_file"("p_session_id" "uuid", "p_user_id" "uuid", "p_original_path" "text", "p_encrypted_filename" "text", "p_checksum_sha256" "text", "p_format_version" "text", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."report_encrypted_file"("p_session_id" "uuid", "p_user_id" "uuid", "p_original_path" "text", "p_encrypted_filename" "text", "p_checksum_sha256" "text", "p_format_version" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_encrypted_file"("p_session_id" "uuid", "p_user_id" "uuid", "p_original_path" "text", "p_encrypted_filename" "text", "p_checksum_sha256" "text", "p_format_version" "text", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."session_start_update"("p_session_id" "uuid", "p_actual_time_ms" integer, "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."session_start_update"("p_session_id" "uuid", "p_actual_time_ms" integer, "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."session_start_update"("p_session_id" "uuid", "p_actual_time_ms" integer, "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."wipe_all_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."wipe_all_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."wipe_all_data"() TO "service_role";
























GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."organization_invites" TO "anon";
GRANT ALL ON TABLE "public"."organization_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invites" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."protected_paths" TO "anon";
GRANT ALL ON TABLE "public"."protected_paths" TO "authenticated";
GRANT ALL ON TABLE "public"."protected_paths" TO "service_role";



GRANT ALL ON TABLE "public"."session_files" TO "anon";
GRANT ALL ON TABLE "public"."session_files" TO "authenticated";
GRANT ALL ON TABLE "public"."session_files" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































