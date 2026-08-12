create table public.floors (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index floors_property_id_idx on public.floors (property_id);

create trigger floors_set_updated_at
before update on public.floors
for each row execute function public.set_updated_at();

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  room_type text not null,
  label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index rooms_floor_id_idx on public.rooms (floor_id);
create index rooms_property_id_idx on public.rooms (property_id);

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  asset_type text not null,
  label text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index assets_property_id_idx on public.assets (property_id);

create trigger assets_set_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

alter table public.floors enable row level security;
alter table public.floors force row level security;
alter table public.rooms enable row level security;
alter table public.rooms force row level security;
alter table public.assets enable row level security;
alter table public.assets force row level security;
