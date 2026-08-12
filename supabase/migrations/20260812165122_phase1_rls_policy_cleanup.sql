-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP POLICY api_keys_admin_all ON public.api_keys;

DROP POLICY assets_write_access ON public.assets;

DROP POLICY floors_write_access ON public.floors;

DROP POLICY inspection_template_pins_write ON public.inspection_template_pins;

DROP POLICY property_assignments_write_admin ON public.property_assignments;

DROP POLICY rooms_write_access ON public.rooms;

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
  SET search_path TO ''
  AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$;

CREATE POLICY api_keys_admin_delete ON public.api_keys
  FOR DELETE
  TO authenticated
  USING (( SELECT app_private.is_org_admin(api_keys.org_id) AS is_org_admin));

CREATE POLICY api_keys_admin_insert ON public.api_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (( SELECT app_private.is_org_admin(api_keys.org_id) AS is_org_admin));

CREATE POLICY api_keys_admin_select ON public.api_keys
  FOR SELECT
  TO authenticated
  USING (( SELECT app_private.is_org_admin(api_keys.org_id) AS is_org_admin));

CREATE POLICY api_keys_admin_update ON public.api_keys
  FOR UPDATE
  TO authenticated
  USING (( SELECT app_private.is_org_admin(api_keys.org_id) AS is_org_admin))
  WITH CHECK (( SELECT app_private.is_org_admin(api_keys.org_id) AS is_org_admin));

CREATE POLICY assets_delete_access ON public.assets
  FOR DELETE
  TO authenticated
  USING (( SELECT app_private.can_access_property(assets.property_id) AS can_access_property));

CREATE POLICY assets_insert_access ON public.assets
  FOR INSERT
  TO authenticated
  WITH CHECK (( SELECT app_private.can_access_property(assets.property_id) AS can_access_property));

CREATE POLICY assets_update_access ON public.assets
  FOR UPDATE
  TO authenticated
  USING (( SELECT app_private.can_access_property(assets.property_id) AS can_access_property))
  WITH CHECK (( SELECT app_private.can_access_property(assets.property_id) AS can_access_property));

CREATE POLICY floors_delete_access ON public.floors
  FOR DELETE
  TO authenticated
  USING (( SELECT app_private.can_access_property(floors.property_id) AS can_access_property));

CREATE POLICY floors_insert_access ON public.floors
  FOR INSERT
  TO authenticated
  WITH CHECK (( SELECT app_private.can_access_property(floors.property_id) AS can_access_property));

CREATE POLICY floors_update_access ON public.floors
  FOR UPDATE
  TO authenticated
  USING (( SELECT app_private.can_access_property(floors.property_id) AS can_access_property))
  WITH CHECK (( SELECT app_private.can_access_property(floors.property_id) AS can_access_property));

CREATE POLICY inspection_template_pins_delete ON public.inspection_template_pins
  FOR DELETE
  TO authenticated
  USING (( SELECT app_private.can_write_inspection(inspection_template_pins.inspection_id) AS can_write_inspection));

CREATE POLICY inspection_template_pins_insert ON public.inspection_template_pins
  FOR INSERT
  TO authenticated
  WITH CHECK (( SELECT app_private.can_write_inspection(inspection_template_pins.inspection_id) AS can_write_inspection));

CREATE POLICY inspection_template_pins_update ON public.inspection_template_pins
  FOR UPDATE
  TO authenticated
  USING (( SELECT app_private.can_write_inspection(inspection_template_pins.inspection_id) AS can_write_inspection))
  WITH CHECK (( SELECT app_private.can_write_inspection(inspection_template_pins.inspection_id) AS can_write_inspection));

CREATE POLICY property_assignments_delete_admin ON public.property_assignments
  FOR DELETE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.properties p
  WHERE
    ((p.id = property_assignments.property_id) AND (( SELECT app_private.is_org_admin(p.home_org_id) AS is_org_admin) OR ( SELECT app_private.is_org_admin(p.created_by_org_id) AS
    is_org_admin))))));

CREATE POLICY property_assignments_insert_admin ON public.property_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.properties p
  WHERE
    ((p.id = property_assignments.property_id) AND (( SELECT app_private.is_org_admin(p.home_org_id) AS is_org_admin) OR ( SELECT app_private.is_org_admin(p.created_by_org_id) AS
    is_org_admin))))));

CREATE POLICY property_assignments_update_admin ON public.property_assignments
  FOR UPDATE
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.properties p
  WHERE
    ((p.id = property_assignments.property_id) AND (( SELECT app_private.is_org_admin(p.home_org_id) AS is_org_admin) OR ( SELECT app_private.is_org_admin(p.created_by_org_id) AS
    is_org_admin))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.properties p
  WHERE
    ((p.id = property_assignments.property_id) AND (( SELECT app_private.is_org_admin(p.home_org_id) AS is_org_admin) OR ( SELECT app_private.is_org_admin(p.created_by_org_id) AS
    is_org_admin))))));

CREATE POLICY rooms_delete_access ON public.rooms
  FOR DELETE
  TO authenticated
  USING (( SELECT app_private.can_access_property(rooms.property_id) AS can_access_property));

CREATE POLICY rooms_insert_access ON public.rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (( SELECT app_private.can_access_property(rooms.property_id) AS can_access_property));

CREATE POLICY rooms_update_access ON public.rooms
  FOR UPDATE
  TO authenticated
  USING (( SELECT app_private.can_access_property(rooms.property_id) AS can_access_property))
  WITH CHECK (( SELECT app_private.can_access_property(rooms.property_id) AS can_access_property));