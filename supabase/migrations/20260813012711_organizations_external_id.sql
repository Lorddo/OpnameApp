-- Dashboard idempotency key for organizations (unique per tenant when set)
alter table public.organizations
  add column if not exists external_id text;

create unique index if not exists organizations_tenant_external_id_uidx
  on public.organizations (tenant_id, external_id)
  where external_id is not null;
