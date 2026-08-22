-- Outbound webhook delivery log (service-role only; no policies).
create type public.webhook_delivery_status as enum (
  'pending',
  'sending',
  'delivered',
  'failed'
);

create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  property_id uuid not null references public.properties (id),
  -- Idempotency: completed_at ISO string for inspection.completed
  dedupe_key text not null,
  payload jsonb not null,
  status public.webhook_delivery_status not null default 'pending',
  attempt_count int not null default 0,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  last_status_code int,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_type, inspection_id, dedupe_key)
);

create index webhook_deliveries_inspection_id_idx
  on public.webhook_deliveries (inspection_id);

create index webhook_deliveries_due_idx
  on public.webhook_deliveries (next_attempt_at)
  where status in ('pending', 'sending');

create trigger webhook_deliveries_set_updated_at
before update on public.webhook_deliveries
for each row execute function public.set_updated_at();

alter table public.webhook_deliveries enable row level security;
alter table public.webhook_deliveries force row level security;

-- Claim due deliveries for cron drain (SKIP LOCKED — not expressible via PostgREST).
create or replace function app_private.claim_webhook_deliveries(p_limit int default 20)
returns setof public.webhook_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.webhook_deliveries as d
  set
    status = 'sending'::public.webhook_delivery_status,
    updated_at = timezone('utc', now())
  where d.id in (
    select id
    from public.webhook_deliveries
    where status in ('pending'::public.webhook_delivery_status, 'sending'::public.webhook_delivery_status)
      and next_attempt_at <= timezone('utc', now())
    order by next_attempt_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  )
  returning d.*;
end;
$$;

revoke all on function app_private.claim_webhook_deliveries(int) from public, anon, authenticated;
grant execute on function app_private.claim_webhook_deliveries(int) to service_role;

-- PostgREST-exposed wrapper (service_role only).
create or replace function public.claim_webhook_deliveries(p_limit int default 20)
returns setof public.webhook_deliveries
language sql
security definer
set search_path = ''
as $$
  select * from app_private.claim_webhook_deliveries(p_limit);
$$;

-- Hosted default privileges grant EXECUTE to anon/authenticated; PUBLIC-only revoke is not enough.
revoke all on function public.claim_webhook_deliveries(int) from public, anon, authenticated;
grant execute on function public.claim_webhook_deliveries(int) to service_role;

revoke all on table public.webhook_deliveries from anon, authenticated;
grant all on table public.webhook_deliveries to service_role;
