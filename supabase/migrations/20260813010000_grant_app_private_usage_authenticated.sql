-- RLS helpers live in app_private; authenticated must be able to resolve them
-- when policies evaluate (USAGE on schema + existing EXECUTE on functions).
grant usage on schema app_private to authenticated;
