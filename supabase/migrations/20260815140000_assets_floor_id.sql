-- Floor-scoped assets (EPA-w schil) plus stable sort. Property-level assets keep floor_id null.
-- App rule: when floor_id is set it must belong to the same property (enforced on insert).

alter table public.assets
  add column floor_id uuid references public.floors (id) on delete cascade,
  add column sort_order integer not null default 0;

create index assets_floor_id_idx on public.assets (floor_id);
