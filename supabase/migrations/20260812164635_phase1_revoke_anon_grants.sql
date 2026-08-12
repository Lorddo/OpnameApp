-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES FROM anon;

CREATE OR REPLACE FUNCTION app_private.can_access_property (
  target_property_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION app_private.can_write_inspection (
  target_inspection_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION app_private.is_org_admin (
  target_org_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION app_private.is_org_member (
  target_org_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = target_org_id
      and m.user_id = (select auth.uid())
  )
  or target_org_id is not distinct from (select app_private.jwt_org_id())
  or target_org_id = any (app_private.jwt_org_ids());
$function$;

CREATE OR REPLACE FUNCTION app_private.jwt_org_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid;
$function$;

CREATE OR REPLACE FUNCTION app_private.jwt_org_ids()
  RETURNS uuid[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(
    (
      select array_agg(value::uuid)
      from jsonb_array_elements_text(
        coalesce(auth.jwt() -> 'app_metadata' -> 'org_ids', '[]'::jsonb)
      ) as t(value)
    ),
    '{}'::uuid[]
  );
$function$;

CREATE OR REPLACE FUNCTION app_private.jwt_org_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_role', '');
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.api_keys FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.assets FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.attributes FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.floors FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.inspection_template_pins FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.inspection_templates FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.inspections FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.observations FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_members FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.photos FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.properties FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.property_assignments FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.rooms FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.tenants FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.facts FROM anon;