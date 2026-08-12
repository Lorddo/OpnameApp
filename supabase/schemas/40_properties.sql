create table public.properties (
  id uuid primary key default gen_random_uuid(),
  home_org_id uuid not null references public.organizations (id),
  created_by_org_id uuid not null references public.organizations (id),
  postcode text not null,
  house_number text not null,
  house_number_addition text,
  city text,
  property_type text,
  build_year integer,
  bag_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index properties_home_org_id_idx on public.properties (home_org_id);
create index properties_created_by_org_id_idx on public.properties (created_by_org_id);
create index properties_postcode_house_number_idx
  on public.properties (postcode, house_number);

create trigger properties_set_updated_at
before update on public.properties
for each row execute function public.set_updated_at();

create type public.property_assignment_role as enum ('inspector', 'viewer');

create table public.property_assignments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  role public.property_assignment_role not null default 'inspector',
  active_from timestamptz not null default timezone('utc', now()),
  active_to timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (property_id, org_id)
);

create index property_assignments_property_id_idx on public.property_assignments (property_id);
create index property_assignments_org_id_idx on public.property_assignments (org_id);
create index property_assignments_active_idx
  on public.property_assignments (org_id, property_id)
  where active_to is null;

create trigger property_assignments_set_updated_at
before update on public.property_assignments
for each row execute function public.set_updated_at();

alter table public.properties enable row level security;
alter table public.properties force row level security;
alter table public.property_assignments enable row level security;
alter table public.property_assignments force row level security;
