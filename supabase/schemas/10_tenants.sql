create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

alter table public.tenants enable row level security;
alter table public.tenants force row level security;
