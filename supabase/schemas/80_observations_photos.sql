create type public.visibility as enum ('private', 'shared', 'public_to_client');
create type public.subject_type as enum ('property', 'floor', 'room', 'asset');

create table public.observations (
  id uuid primary key,
  property_id uuid not null references public.properties (id),
  inspection_id uuid not null references public.inspections (id),
  attribute_key text not null references public.attributes (attribute_key),
  subject_type public.subject_type not null,
  subject_id uuid not null,
  value jsonb,
  observed_at timestamptz not null default timezone('utc', now()),
  observer_id uuid references public.profiles (id),
  owner_org_id uuid not null references public.organizations (id),
  visibility public.visibility not null default 'private',
  device_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index observations_property_attribute_idx
  on public.observations (property_id, attribute_key);
create index observations_inspection_updated_at_idx
  on public.observations (inspection_id, updated_at);
create index observations_owner_org_id_idx on public.observations (owner_org_id);
create index observations_subject_idx
  on public.observations (subject_type, subject_id);
create index observations_lww_idx
  on public.observations (property_id, subject_type, subject_id, attribute_key, owner_org_id, updated_at desc);

create trigger observations_set_updated_at
before update on public.observations
for each row execute function public.set_updated_at();

create table public.photos (
  id uuid primary key,
  property_id uuid not null references public.properties (id),
  observation_id uuid references public.observations (id),
  subject_type public.subject_type,
  subject_id uuid,
  owner_org_id uuid not null references public.organizations (id),
  visibility public.visibility not null default 'private',
  storage_provider text not null default 'r2',
  storage_key text not null,
  checksum text,
  source_inspection_id uuid references public.inspections (id),
  -- Null until R2 PUT succeeds; meta row is created earlier via upload-url.
  uploaded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index photos_property_id_idx on public.photos (property_id);
create index photos_observation_id_idx on public.photos (observation_id);
create index photos_owner_org_id_idx on public.photos (owner_org_id);
create index photos_source_inspection_id_idx on public.photos (source_inspection_id);
create index photos_pending_upload_idx on public.photos (source_inspection_id)
  where uploaded_at is null;

create trigger photos_set_updated_at
before update on public.photos
for each row execute function public.set_updated_at();

alter table public.observations enable row level security;
alter table public.observations force row level security;
alter table public.photos enable row level security;
alter table public.photos force row level security;
