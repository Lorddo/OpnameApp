create type public.org_type as enum ('inspection', 'client', 'platform');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  name text not null,
  org_type public.org_type not null,
  -- Idempotent key from Pranimate dashboard (unique per tenant when set)
  external_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index organizations_tenant_id_idx on public.organizations (tenant_id);
create index organizations_org_type_idx on public.organizations (org_type);
create unique index organizations_tenant_external_id_uidx
  on public.organizations (tenant_id, external_id)
  where external_id is not null;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.organizations force row level security;
