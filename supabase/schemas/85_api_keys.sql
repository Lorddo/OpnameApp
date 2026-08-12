-- Machine credentials for Pranimate dashboard (hashed at rest).
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (key_prefix)
);

create index api_keys_org_id_idx on public.api_keys (org_id);
create index api_keys_active_idx on public.api_keys (org_id)
  where revoked_at is null;

create trigger api_keys_set_updated_at
before update on public.api_keys
for each row execute function public.set_updated_at();

alter table public.api_keys enable row level security;
alter table public.api_keys force row level security;
