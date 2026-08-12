-- RLS helpers live in app_private (not exposed via Data API).

create or replace function app_private.jwt_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select array_agg(value::uuid)
      from jsonb_array_elements_text(
        coalesce(auth.jwt() -> 'app_metadata' -> 'org_ids', '[]'::jsonb)
      ) as t(value)
    ),
    '{}'::uuid[]
  );
$$;

create or replace function app_private.jwt_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid;
$$;

create or replace function app_private.jwt_org_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_role', '');
$$;

create or replace function app_private.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = target_org_id
      and m.user_id = (select auth.uid())
  )
  or target_org_id is not distinct from (select app_private.jwt_org_id())
  or target_org_id = any (app_private.jwt_org_ids());
$$;

create or replace function app_private.is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = target_org_id
      and m.user_id = (select auth.uid())
      and m.role = 'admin'
  )
  or (
    target_org_id = (select app_private.jwt_org_id())
    and (select app_private.jwt_org_role()) = 'admin'
  );
$$;

create or replace function app_private.can_access_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = target_property_id
      and (
        (select app_private.is_org_member(p.home_org_id))
        or (select app_private.is_org_member(p.created_by_org_id))
        or exists (
          select 1
          from public.property_assignments a
          where a.property_id = p.id
            and (select app_private.is_org_member(a.org_id))
            and a.active_from <= timezone('utc', now())
            and (a.active_to is null or a.active_to > timezone('utc', now()))
        )
      )
  );
$$;

create or replace function app_private.can_write_inspection(target_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.inspections i
    where i.id = target_inspection_id
      and (select app_private.is_org_member(i.owner_org_id))
      and (
        (select app_private.is_org_admin(i.owner_org_id))
        or i.inspector_id = (select auth.uid())
        or i.assigned_user_id = (select auth.uid())
      )
  );
$$;

revoke all on function app_private.jwt_org_ids() from public;
revoke all on function app_private.jwt_org_id() from public;
revoke all on function app_private.jwt_org_role() from public;
revoke all on function app_private.is_org_member(uuid) from public;
revoke all on function app_private.is_org_admin(uuid) from public;
revoke all on function app_private.can_access_property(uuid) from public;
revoke all on function app_private.can_write_inspection(uuid) from public;

-- Policies call these via the table owner / postgres role path;
-- grant execute only to roles that evaluate RLS.
grant execute on function app_private.jwt_org_ids() to authenticated, service_role;
grant execute on function app_private.jwt_org_id() to authenticated, service_role;
grant execute on function app_private.jwt_org_role() to authenticated, service_role;
grant execute on function app_private.is_org_member(uuid) to authenticated, service_role;
grant execute on function app_private.is_org_admin(uuid) to authenticated, service_role;
grant execute on function app_private.can_access_property(uuid) to authenticated, service_role;
grant execute on function app_private.can_write_inspection(uuid) to authenticated, service_role;
