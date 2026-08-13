-- Private schema for RLS helpers (not exposed via Data API).
create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon;
-- authenticated needs USAGE so RLS policies can call app_private.* helpers.
-- There are no tables in this schema; only SECURITY DEFINER helpers are granted EXECUTE.
grant usage on schema app_private to postgres, service_role, authenticated;
