-- Hosted default privileges grant EXECUTE on public functions to anon/authenticated.
-- REVOKE FROM PUBLIC alone left claim_webhook_deliveries and handle_new_user callable
-- via PostgREST (supabase db advisors: 0028 / 0029).

revoke all on function public.claim_webhook_deliveries(int) from public, anon, authenticated;
grant execute on function public.claim_webhook_deliveries(int) to service_role;

revoke all on function app_private.claim_webhook_deliveries(int) from public, anon, authenticated;
grant execute on function app_private.claim_webhook_deliveries(int) to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

revoke all on table public.webhook_deliveries from anon, authenticated;
grant all on table public.webhook_deliveries to service_role;
