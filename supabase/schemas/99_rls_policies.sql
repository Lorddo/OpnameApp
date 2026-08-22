-- Grants for Data API exposure (RLS still enforces row access).
grant usage on schema public to anon, authenticated, service_role;

-- authenticated: full DML under RLS; anon: no table access
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant select on public.facts to authenticated, service_role;
revoke all on public.facts from anon;

alter default privileges in schema public
  revoke all on tables from anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;

-- ---------------------------------------------------------------------------
-- Catalog / reference data
-- ---------------------------------------------------------------------------

create policy attributes_select_authenticated
on public.attributes
for select
to authenticated
using (true);

create policy inspection_templates_select_authenticated
on public.inspection_templates
for select
to authenticated
using (true);

-- ---------------------------------------------------------------------------
-- Tenants / organizations / membership
-- ---------------------------------------------------------------------------

create policy tenants_select_member
on public.tenants
for select
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.tenant_id = tenants.id
      and (select app_private.is_org_member(o.id))
  )
);

create policy organizations_select_member
on public.organizations
for select
to authenticated
using ((select app_private.is_org_member(id)));

create policy profiles_select_self_or_org
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.org_members mine
    join public.org_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = profiles.id
  )
);

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy org_members_select_same_org
on public.org_members
for select
to authenticated
using ((select app_private.is_org_member(org_id)));

-- ---------------------------------------------------------------------------
-- Properties + structure
-- ---------------------------------------------------------------------------

create policy properties_select_access
on public.properties
for select
to authenticated
using ((select app_private.can_access_property(id)));

create policy properties_insert_member
on public.properties
for insert
to authenticated
with check (
  (select app_private.is_org_member(created_by_org_id))
  and (select app_private.is_org_member(home_org_id)
       or home_org_id = created_by_org_id)
);

create policy properties_update_access
on public.properties
for update
to authenticated
using ((select app_private.can_access_property(id)))
with check ((select app_private.can_access_property(id)));

create policy property_assignments_select_access
on public.property_assignments
for select
to authenticated
using (
  (select app_private.is_org_member(org_id))
  or (select app_private.can_access_property(property_id))
);

create policy property_assignments_insert_admin
on public.property_assignments
for insert
to authenticated
with check (
  exists (
    select 1 from public.properties p
    where p.id = property_assignments.property_id
      and (
        (select app_private.is_org_admin(p.home_org_id))
        or (select app_private.is_org_admin(p.created_by_org_id))
      )
  )
);

create policy property_assignments_update_admin
on public.property_assignments
for update
to authenticated
using (
  exists (
    select 1 from public.properties p
    where p.id = property_assignments.property_id
      and (
        (select app_private.is_org_admin(p.home_org_id))
        or (select app_private.is_org_admin(p.created_by_org_id))
      )
  )
)
with check (
  exists (
    select 1 from public.properties p
    where p.id = property_assignments.property_id
      and (
        (select app_private.is_org_admin(p.home_org_id))
        or (select app_private.is_org_admin(p.created_by_org_id))
      )
  )
);

create policy property_assignments_delete_admin
on public.property_assignments
for delete
to authenticated
using (
  exists (
    select 1 from public.properties p
    where p.id = property_assignments.property_id
      and (
        (select app_private.is_org_admin(p.home_org_id))
        or (select app_private.is_org_admin(p.created_by_org_id))
      )
  )
);

create policy floors_select_access
on public.floors
for select
to authenticated
using ((select app_private.can_access_property(property_id)));

create policy floors_insert_access
on public.floors
for insert
to authenticated
with check ((select app_private.can_access_property(property_id)));

create policy floors_update_access
on public.floors
for update
to authenticated
using ((select app_private.can_access_property(property_id)))
with check ((select app_private.can_access_property(property_id)));

create policy floors_delete_access
on public.floors
for delete
to authenticated
using ((select app_private.can_access_property(property_id)));

create policy rooms_select_access
on public.rooms
for select
to authenticated
using ((select app_private.can_access_property(property_id)));

create policy rooms_insert_access
on public.rooms
for insert
to authenticated
with check ((select app_private.can_access_property(property_id)));

create policy rooms_update_access
on public.rooms
for update
to authenticated
using ((select app_private.can_access_property(property_id)))
with check ((select app_private.can_access_property(property_id)));

create policy rooms_delete_access
on public.rooms
for delete
to authenticated
using ((select app_private.can_access_property(property_id)));

create policy assets_select_access
on public.assets
for select
to authenticated
using ((select app_private.can_access_property(property_id)));

create policy assets_insert_access
on public.assets
for insert
to authenticated
with check ((select app_private.can_access_property(property_id)));

create policy assets_update_access
on public.assets
for update
to authenticated
using ((select app_private.can_access_property(property_id)))
with check ((select app_private.can_access_property(property_id)));

create policy assets_delete_access
on public.assets
for delete
to authenticated
using ((select app_private.can_access_property(property_id)));

-- ---------------------------------------------------------------------------
-- Inspections
-- ---------------------------------------------------------------------------

create policy inspections_select_org
on public.inspections
for select
to authenticated
using (
  (select app_private.is_org_member(owner_org_id))
  and (
    (select app_private.is_org_admin(owner_org_id))
    or inspector_id = (select auth.uid())
    or assigned_user_id = (select auth.uid())
  )
);

create policy inspections_insert_org
on public.inspections
for insert
to authenticated
with check (
  (select app_private.is_org_member(owner_org_id))
  and (select app_private.can_access_property(property_id))
);

create policy inspections_update_write
on public.inspections
for update
to authenticated
using ((select app_private.can_write_inspection(id)))
with check ((select app_private.can_write_inspection(id)));

create policy inspection_template_pins_select
on public.inspection_template_pins
for select
to authenticated
using (
  exists (
    select 1 from public.inspections i
    where i.id = inspection_template_pins.inspection_id
      and (select app_private.is_org_member(i.owner_org_id))
      and (
        (select app_private.is_org_admin(i.owner_org_id))
        or i.inspector_id = (select auth.uid())
        or i.assigned_user_id = (select auth.uid())
      )
  )
);

create policy inspection_template_pins_insert
on public.inspection_template_pins
for insert
to authenticated
with check ((select app_private.can_write_inspection(inspection_id)));

create policy inspection_template_pins_update
on public.inspection_template_pins
for update
to authenticated
using ((select app_private.can_write_inspection(inspection_id)))
with check ((select app_private.can_write_inspection(inspection_id)));

create policy inspection_template_pins_delete
on public.inspection_template_pins
for delete
to authenticated
using ((select app_private.can_write_inspection(inspection_id)));

-- ---------------------------------------------------------------------------
-- Observations / photos (MVP: private only in practice)
-- ---------------------------------------------------------------------------

create policy observations_select_owner
on public.observations
for select
to authenticated
using (
  (select app_private.is_org_member(owner_org_id))
  and (
    (select app_private.is_org_admin(owner_org_id))
    or observer_id = (select auth.uid())
    or (select app_private.can_write_inspection(inspection_id))
  )
);

create policy observations_insert_write
on public.observations
for insert
to authenticated
with check (
  (select app_private.is_org_member(owner_org_id))
  and (select app_private.can_write_inspection(inspection_id))
);

create policy observations_update_write
on public.observations
for update
to authenticated
using (
  (select app_private.is_org_member(owner_org_id))
  and (select app_private.can_write_inspection(inspection_id))
)
with check (
  (select app_private.is_org_member(owner_org_id))
  and (select app_private.can_write_inspection(inspection_id))
);

create policy photos_select_owner
on public.photos
for select
to authenticated
using ((select app_private.is_org_member(owner_org_id)));

create policy photos_insert_write
on public.photos
for insert
to authenticated
with check (
  (select app_private.is_org_member(owner_org_id))
  and (
    source_inspection_id is null
    or (select app_private.can_write_inspection(source_inspection_id))
  )
);

create policy photos_update_write
on public.photos
for update
to authenticated
using ((select app_private.is_org_member(owner_org_id)))
with check ((select app_private.is_org_member(owner_org_id)));

create policy photos_delete_write
on public.photos
for delete
to authenticated
using (
  (select app_private.is_org_member(owner_org_id))
  and (
    source_inspection_id is null
    or (select app_private.can_write_inspection(source_inspection_id))
  )
);

-- ---------------------------------------------------------------------------
-- API keys: readable/writable only by org admins (hashes never leave server ideally)
-- ---------------------------------------------------------------------------

create policy api_keys_admin_select
on public.api_keys
for select
to authenticated
using ((select app_private.is_org_admin(org_id)));

create policy api_keys_admin_insert
on public.api_keys
for insert
to authenticated
with check ((select app_private.is_org_admin(org_id)));

create policy api_keys_admin_update
on public.api_keys
for update
to authenticated
using ((select app_private.is_org_admin(org_id)))
with check ((select app_private.is_org_admin(org_id)));

create policy api_keys_admin_delete
on public.api_keys
for delete
to authenticated
using ((select app_private.is_org_admin(org_id)));

-- Re-assert after the blanket authenticated table GRANT at the top of this file.
revoke all on table public.webhook_deliveries from anon, authenticated;
grant all on table public.webhook_deliveries to service_role;
revoke all on function public.claim_webhook_deliveries(int) from public, anon, authenticated;
grant execute on function public.claim_webhook_deliveries(int) to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
