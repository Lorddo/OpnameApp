create type public.inspection_status as enum (
  'draft',
  'assigned',
  'in_progress',
  'completed',
  'synced'
);

create table public.inspections (
  id uuid primary key,
  property_id uuid not null references public.properties (id),
  owner_org_id uuid not null references public.organizations (id),
  client_org_id uuid references public.organizations (id),
  inspector_id uuid references public.profiles (id),
  assigned_user_id uuid references public.profiles (id),
  status public.inspection_status not null default 'draft',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index inspections_property_id_idx on public.inspections (property_id);
create index inspections_owner_org_id_idx on public.inspections (owner_org_id);
create index inspections_client_org_id_idx on public.inspections (client_org_id);
create index inspections_inspector_id_idx on public.inspections (inspector_id);
create index inspections_assigned_user_id_idx on public.inspections (assigned_user_id);
create index inspections_updated_at_idx on public.inspections (updated_at);

create trigger inspections_set_updated_at
before update on public.inspections
for each row execute function public.set_updated_at();

create table public.inspection_template_pins (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  template_key text not null,
  template_version text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (inspection_id, template_key),
  foreign key (template_key, template_version)
    references public.inspection_templates (template_key, version)
);

create index inspection_template_pins_inspection_id_idx
  on public.inspection_template_pins (inspection_id);
create index inspection_template_pins_template_idx
  on public.inspection_template_pins (template_key, template_version);

alter table public.inspections enable row level security;
alter table public.inspections force row level security;
alter table public.inspection_template_pins enable row level security;
alter table public.inspection_template_pins force row level security;
