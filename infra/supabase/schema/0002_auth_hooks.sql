-- Auth hooks that live on the Supabase-managed `auth` schema and therefore are
-- NOT captured by `supabase db dump` (which excludes managed schemas).
-- Applied after the stack boots, once auth.users exists.

-- Fire handle_new_user() whenever a new auth user is created, so the matching
-- public.users row, personal organization, and owner membership are provisioned.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
