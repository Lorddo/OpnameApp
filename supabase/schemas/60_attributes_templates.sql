create type public.answer_scope as enum ('room', 'floor', 'property', 'asset');
create type public.answer_type as enum ('boolean', 'choice', 'text', 'number');

create table public.attributes (
  attribute_key text primary key,
  answer_scope public.answer_scope not null,
  question_key text not null,
  label text not null,
  answer_type public.answer_type not null,
  options jsonb,
  help_text text,
  unit text,
  min_value numeric,
  max_value numeric,
  step_value numeric,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint attributes_key_matches_parts
    check (attribute_key = answer_scope::text || '.' || question_key)
);

create trigger attributes_set_updated_at
before update on public.attributes
for each row execute function public.set_updated_at();

create table public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  version text not null,
  label text not null,
  locale text not null default 'nl-NL',
  config jsonb not null,
  published_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (template_key, version)
);

create index inspection_templates_template_key_idx
  on public.inspection_templates (template_key);

create trigger inspection_templates_set_updated_at
before update on public.inspection_templates
for each row execute function public.set_updated_at();

alter table public.attributes enable row level security;
alter table public.attributes force row level security;
alter table public.inspection_templates enable row level security;
alter table public.inspection_templates force row level security;
