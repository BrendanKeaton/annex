-- Seed data required for the app to function on a fresh self-hosted instance.

-- handle_new_user() assigns every new org the plan named 'free'
-- (organizations.subscription_plan_id is NOT NULL), so this row must exist
-- before the first signup. Adjust limits/pricing to taste.
-- NOTE: subscription_plans.code is NOT NULL with CHECK (length(code) <= 16),
-- but its default is gen_random_uuid() (36 chars) which violates that check,
-- so an explicit short code must be supplied.
INSERT INTO public.subscription_plans (name, code, max_users, max_files_stored, price_monthly)
VALUES ('free', 'free', 5, 100, 0)
ON CONFLICT (name) DO NOTHING;

-- Storage bucket the backend uploads company logos to
-- (app/auth/service.py -> storage.from_('company_logos')).
INSERT INTO storage.buckets (id, name, public)
VALUES ('company_logos', 'company_logos', true)
ON CONFLICT (id) DO NOTHING;
