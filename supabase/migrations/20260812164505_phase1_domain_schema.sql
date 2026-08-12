-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE SCHEMA app_private AUTHORIZATION postgres;

GRANT USAGE ON SCHEMA app_private TO service_role;

CREATE FUNCTION app_private.can_access_property (
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

REVOKE ALL ON FUNCTION app_private.can_access_property(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION app_private.can_access_property(uuid) TO authenticated;

GRANT ALL ON FUNCTION app_private.can_access_property(uuid) TO service_role;

CREATE FUNCTION app_private.can_write_inspection (
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

REVOKE ALL ON FUNCTION app_private.can_write_inspection(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION app_private.can_write_inspection(uuid) TO authenticated;

GRANT ALL ON FUNCTION app_private.can_write_inspection(uuid) TO service_role;

CREATE FUNCTION app_private.is_org_admin (
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

REVOKE ALL ON FUNCTION app_private.is_org_admin(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION app_private.is_org_admin(uuid) TO authenticated;

GRANT ALL ON FUNCTION app_private.is_org_admin(uuid) TO service_role;

CREATE FUNCTION app_private.is_org_member (
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

REVOKE ALL ON FUNCTION app_private.is_org_member(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION app_private.is_org_member(uuid) TO authenticated;

GRANT ALL ON FUNCTION app_private.is_org_member(uuid) TO service_role;

CREATE FUNCTION app_private.jwt_org_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid;
$function$;

REVOKE ALL ON FUNCTION app_private.jwt_org_id() FROM PUBLIC;

GRANT ALL ON FUNCTION app_private.jwt_org_id() TO authenticated;

GRANT ALL ON FUNCTION app_private.jwt_org_id() TO service_role;

CREATE FUNCTION app_private.jwt_org_ids()
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

REVOKE ALL ON FUNCTION app_private.jwt_org_ids() FROM PUBLIC;

GRANT ALL ON FUNCTION app_private.jwt_org_ids() TO authenticated;

GRANT ALL ON FUNCTION app_private.jwt_org_ids() TO service_role;

CREATE FUNCTION app_private.jwt_org_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_role', '');
$function$;

REVOKE ALL ON FUNCTION app_private.jwt_org_role() FROM PUBLIC;

GRANT ALL ON FUNCTION app_private.jwt_org_role() TO authenticated;

GRANT ALL ON FUNCTION app_private.jwt_org_role() TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

CREATE TYPE public.answer_scope AS ENUM (
  'room',
  'floor',
  'property',
  'asset'
);

CREATE TYPE public.answer_type AS ENUM (
  'boolean',
  'choice',
  'text',
  'number'
);

CREATE TYPE public.inspection_status AS ENUM (
  'draft',
  'assigned',
  'in_progress',
  'completed',
  'synced'
);

CREATE TYPE public.org_role AS ENUM (
  'inspector',
  'admin'
);

CREATE TYPE public.org_type AS ENUM (
  'inspection',
  'client',
  'platform'
);

CREATE TYPE public.property_assignment_role AS ENUM (
  'inspector',
  'viewer'
);

CREATE TYPE public.subject_type AS ENUM (
  'property',
  'floor',
  'room',
  'asset'
);

CREATE TYPE public.visibility AS ENUM (
  'private',
  'shared',
  'public_to_client'
);

CREATE FUNCTION public.handle_new_user()
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

GRANT ALL ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

CREATE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;

GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;

CREATE TABLE public.api_keys (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id       uuid                     NOT NULL,
  name         text                     NOT NULL,
  key_prefix   text                     NOT NULL,
  key_hash     text                     NOT NULL,
  scopes       text[]                   DEFAULT '{}'::text[] NOT NULL,
  last_used_at timestamp with time zone,
  revoked_at   timestamp with time zone,
  created_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.api_keys
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.api_keys
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_key_prefix_key UNIQUE (key_prefix);

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.api_keys TO anon;

GRANT ALL ON public.api_keys TO authenticated;

GRANT ALL ON public.api_keys TO service_role;

CREATE INDEX api_keys_active_idx ON public.api_keys (org_id)
  WHERE revoked_at IS NULL;

CREATE INDEX api_keys_org_id_idx ON public.api_keys (org_id);

CREATE TRIGGER api_keys_set_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY api_keys_admin_all ON public.api_keys
  TO authenticated
  USING (( SELECT app_private.is_org_admin(api_keys.org_id) AS is_org_admin))
  WITH CHECK (( SELECT app_private.is_org_admin(api_keys.org_id) AS is_org_admin));

CREATE TABLE public.assets (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  property_id uuid                     NOT NULL,
  asset_type  text                     NOT NULL,
  label       text,
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.assets
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.assets
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.assets
  ADD CONSTRAINT assets_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.assets TO anon;

GRANT ALL ON public.assets TO authenticated;

GRANT ALL ON public.assets TO service_role;

CREATE INDEX assets_property_id_idx ON public.assets (property_id);

CREATE TRIGGER assets_set_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY assets_select_access ON public.assets
  FOR SELECT
  TO authenticated
  USING (( SELECT app_private.can_access_property(assets.property_id) AS can_access_property));

CREATE POLICY assets_write_access ON public.assets
  TO authenticated
  USING (( SELECT app_private.can_access_property(assets.property_id) AS can_access_property))
  WITH CHECK (( SELECT app_private.can_access_property(assets.property_id) AS can_access_property));

CREATE TABLE public.attributes (
  attribute_key text                     NOT NULL,
  answer_scope  public.answer_scope      NOT NULL,
  question_key  text                     NOT NULL,
  label         text                     NOT NULL,
  answer_type   public.answer_type       NOT NULL,
  options       jsonb,
  help_text     text,
  unit          text,
  min_value     numeric,
  max_value     numeric,
  step_value    numeric,
  created_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.attributes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.attributes
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.attributes
  ADD CONSTRAINT attributes_key_matches_parts CHECK (attribute_key = ((answer_scope::text || '.'::text) || question_key));

ALTER TABLE public.attributes
  ADD CONSTRAINT attributes_pkey PRIMARY KEY (attribute_key);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.attributes TO anon;

GRANT ALL ON public.attributes TO authenticated;

GRANT ALL ON public.attributes TO service_role;

CREATE TRIGGER attributes_set_updated_at
  BEFORE UPDATE ON public.attributes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY attributes_select_authenticated ON public.attributes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.floors (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  property_id uuid                     NOT NULL,
  label       text                     NOT NULL,
  sort_order  integer                  DEFAULT 0 NOT NULL,
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.floors
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.floors
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.floors
  ADD CONSTRAINT floors_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.floors TO anon;

GRANT ALL ON public.floors TO authenticated;

GRANT ALL ON public.floors TO service_role;

CREATE INDEX floors_property_id_idx ON public.floors (property_id);

CREATE TRIGGER floors_set_updated_at
  BEFORE UPDATE ON public.floors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY floors_select_access ON public.floors
  FOR SELECT
  TO authenticated
  USING (( SELECT app_private.can_access_property(floors.property_id) AS can_access_property));

CREATE POLICY floors_write_access ON public.floors
  TO authenticated
  USING (( SELECT app_private.can_access_property(floors.property_id) AS can_access_property))
  WITH CHECK (( SELECT app_private.can_access_property(floors.property_id) AS can_access_property));

CREATE TABLE public.inspection_template_pins (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  inspection_id    uuid                     NOT NULL,
  template_key     text                     NOT NULL,
  template_version text                     NOT NULL,
  created_at       timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.inspection_template_pins
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inspection_template_pins
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inspection_template_pins
  ADD CONSTRAINT inspection_template_pins_inspection_id_template_key_key UNIQUE (inspection_id, template_key);

ALTER TABLE public.inspection_template_pins
  ADD CONSTRAINT inspection_template_pins_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.inspection_template_pins TO anon;

GRANT ALL ON public.inspection_template_pins TO authenticated;

GRANT ALL ON public.inspection_template_pins TO service_role;

CREATE INDEX inspection_template_pins_template_idx ON public.inspection_template_pins (template_key, template_version);

CREATE INDEX inspection_template_pins_inspection_id_idx ON public.inspection_template_pins (inspection_id);

CREATE POLICY inspection_template_pins_write ON public.inspection_template_pins
  TO authenticated
  USING (( SELECT app_private.can_write_inspection(inspection_template_pins.inspection_id) AS can_write_inspection))
  WITH CHECK (( SELECT app_private.can_write_inspection(inspection_template_pins.inspection_id) AS can_write_inspection));

CREATE TABLE public.inspection_templates (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  template_key text                     NOT NULL,
  version      text                     NOT NULL,
  label        text                     NOT NULL,
  locale       text                     DEFAULT 'nl-NL'::text NOT NULL,
  config       jsonb                    NOT NULL,
  published_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.inspection_templates
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inspection_templates
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inspection_templates
  ADD CONSTRAINT inspection_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.inspection_templates
  ADD CONSTRAINT inspection_templates_template_key_version_key UNIQUE (template_key, VERSION);

ALTER TABLE public.inspection_template_pins
  ADD CONSTRAINT inspection_template_pins_template_key_template_version_fkey FOREIGN KEY (template_key, template_version)
    REFERENCES public.inspection_templates(template_key, VERSION);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.inspection_templates TO anon;

GRANT ALL ON public.inspection_templates TO authenticated;

GRANT ALL ON public.inspection_templates TO service_role;

CREATE INDEX inspection_templates_template_key_idx ON public.inspection_templates (template_key);

CREATE TRIGGER inspection_templates_set_updated_at
  BEFORE UPDATE ON public.inspection_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY inspection_templates_select_authenticated ON public.inspection_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE public.inspections (
  id               uuid                     NOT NULL,
  property_id      uuid                     NOT NULL,
  owner_org_id     uuid                     NOT NULL,
  client_org_id    uuid,
  inspector_id     uuid,
  assigned_user_id uuid,
  status           public.inspection_status DEFAULT 'draft'::public.inspection_status NOT NULL,
  started_at       timestamp with time zone,
  completed_at     timestamp with time zone,
  created_at       timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at       timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE POLICY inspection_template_pins_select ON public.inspection_template_pins
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.inspections i
  WHERE
    ((i.id = inspection_template_pins.inspection_id) AND ( SELECT app_private.is_org_member(i.owner_org_id) AS is_org_member) AND (( SELECT app_private.is_org_admin(i.owner_org_id)
    AS is_org_admin) OR (i.inspector_id = ( SELECT auth.uid() AS uid)) OR (i.assigned_user_id = ( SELECT auth.uid() AS uid)))))));

ALTER TABLE public.inspections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inspections
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_pkey PRIMARY KEY (id);

ALTER TABLE public.inspection_template_pins
  ADD CONSTRAINT inspection_template_pins_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.inspections TO anon;

GRANT ALL ON public.inspections TO authenticated;

GRANT ALL ON public.inspections TO service_role;

CREATE INDEX inspections_assigned_user_id_idx ON public.inspections (assigned_user_id);

CREATE INDEX inspections_inspector_id_idx ON public.inspections (inspector_id);

CREATE INDEX inspections_client_org_id_idx ON public.inspections (client_org_id);

CREATE INDEX inspections_owner_org_id_idx ON public.inspections (owner_org_id);

CREATE INDEX inspections_property_id_idx ON public.inspections (property_id);

CREATE INDEX inspections_updated_at_idx ON public.inspections (updated_at);

CREATE TRIGGER inspections_set_updated_at
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY inspections_insert_org ON public.inspections
  FOR INSERT
  TO authenticated
  WITH
    CHECK
    ((( SELECT app_private.is_org_member(inspections.owner_org_id) AS is_org_member) AND ( SELECT app_private.can_access_property(inspections.property_id) AS can_access_property)));

CREATE POLICY inspections_select_org ON public.inspections
  FOR SELECT
  TO authenticated
  USING
    ((( SELECT app_private.is_org_member(inspections.owner_org_id) AS is_org_member) AND (( SELECT app_private.is_org_admin(inspections.owner_org_id) AS is_org_admin) OR
    (inspector_id = ( SELECT auth.uid() AS uid)) OR (assigned_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY inspections_update_write ON public.inspections
  FOR UPDATE
  TO authenticated
  USING (( SELECT app_private.can_write_inspection(inspections.id) AS can_write_inspection))
  WITH CHECK (( SELECT app_private.can_write_inspection(inspections.id) AS can_write_inspection));

CREATE TABLE public.observations (
  id            uuid                     NOT NULL,
  property_id   uuid                     NOT NULL,
  inspection_id uuid                     NOT NULL,
  attribute_key text                     NOT NULL,
  subject_type  public.subject_type      NOT NULL,
  subject_id    uuid                     NOT NULL,
  value         jsonb,
  observed_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  observer_id   uuid,
  owner_org_id  uuid                     NOT NULL,
  visibility    public.visibility        DEFAULT 'private'::public.visibility NOT NULL,
  device_id     text,
  created_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at    timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.observations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.observations
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.observations
  ADD CONSTRAINT observations_attribute_key_fkey FOREIGN KEY (attribute_key) REFERENCES public.attributes(attribute_key);

ALTER TABLE public.observations
  ADD CONSTRAINT observations_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id);

ALTER TABLE public.observations
  ADD CONSTRAINT observations_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.observations TO anon;

GRANT ALL ON public.observations TO authenticated;

GRANT ALL ON public.observations TO service_role;

CREATE INDEX observations_subject_idx ON public.observations (subject_type, subject_id);

CREATE INDEX observations_owner_org_id_idx ON public.observations (owner_org_id);

CREATE INDEX observations_inspection_updated_at_idx ON public.observations (inspection_id, updated_at);

CREATE INDEX observations_property_attribute_idx ON public.observations (property_id, attribute_key);

CREATE INDEX observations_lww_idx ON public.observations (property_id, subject_type, subject_id, attribute_key, owner_org_id, updated_at DESC);

CREATE TRIGGER observations_set_updated_at
  BEFORE UPDATE ON public.observations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY observations_insert_write ON public.observations
  FOR INSERT
  TO authenticated
  WITH
    CHECK
    ((( SELECT app_private.is_org_member(observations.owner_org_id) AS is_org_member) AND ( SELECT app_private.can_write_inspection(observations.inspection_id) AS
    can_write_inspection)));

CREATE POLICY observations_select_owner ON public.observations
  FOR SELECT
  TO authenticated
  USING
    ((( SELECT app_private.is_org_member(observations.owner_org_id) AS is_org_member) AND (( SELECT app_private.is_org_admin(observations.owner_org_id) AS is_org_admin) OR
    (observer_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app_private.can_write_inspection(observations.inspection_id) AS can_write_inspection))));

CREATE POLICY observations_update_write ON public.observations
  FOR UPDATE
  TO authenticated
  USING
    ((( SELECT app_private.is_org_member(observations.owner_org_id) AS is_org_member) AND ( SELECT app_private.can_write_inspection(observations.inspection_id) AS
    can_write_inspection)))
  WITH
    CHECK
    ((( SELECT app_private.is_org_member(observations.owner_org_id) AS is_org_member) AND ( SELECT app_private.can_write_inspection(observations.inspection_id) AS
    can_write_inspection)));

CREATE TABLE public.org_members (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  org_id     uuid                     NOT NULL,
  user_id    uuid                     NOT NULL,
  role       public.org_role          DEFAULT 'inspector'::public.org_role NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.org_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.org_members
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_org_id_user_id_key UNIQUE (org_id, user_id);

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_pkey PRIMARY KEY (id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.org_members TO anon;

GRANT ALL ON public.org_members TO authenticated;

GRANT ALL ON public.org_members TO service_role;

CREATE INDEX org_members_org_id_idx ON public.org_members (org_id);

CREATE INDEX org_members_user_id_idx ON public.org_members (user_id);

CREATE TRIGGER org_members_set_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY org_members_select_same_org ON public.org_members
  FOR SELECT
  TO authenticated
  USING (( SELECT app_private.is_org_member(org_members.org_id) AS is_org_member));

CREATE TABLE public.organizations (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  tenant_id  uuid                     NOT NULL,
  name       text                     NOT NULL,
  org_type   public.org_type          NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.organizations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_client_org_id_fkey FOREIGN KEY (client_org_id) REFERENCES public.organizations(id);

ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_owner_org_id_fkey FOREIGN KEY (owner_org_id) REFERENCES public.organizations(id);

ALTER TABLE public.observations
  ADD CONSTRAINT observations_owner_org_id_fkey FOREIGN KEY (owner_org_id) REFERENCES public.organizations(id);

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.organizations TO anon;

GRANT ALL ON public.organizations TO authenticated;

GRANT ALL ON public.organizations TO service_role;

CREATE INDEX organizations_tenant_id_idx ON public.organizations (tenant_id);

CREATE INDEX organizations_org_type_idx ON public.organizations (org_type);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY organizations_select_member ON public.organizations
  FOR SELECT
  TO authenticated
  USING (( SELECT app_private.is_org_member(organizations.id) AS is_org_member));

CREATE TABLE public.photos (
  id                   uuid                     NOT NULL,
  property_id          uuid                     NOT NULL,
  observation_id       uuid,
  subject_type         public.subject_type,
  subject_id           uuid,
  owner_org_id         uuid                     NOT NULL,
  visibility           public.visibility        DEFAULT 'private'::public.visibility NOT NULL,
  storage_provider     text                     DEFAULT 'r2'::text NOT NULL,
  storage_key          text                     NOT NULL,
  checksum             text,
  source_inspection_id uuid,
  created_at           timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at           timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.photos
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.photos
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.photos
  ADD CONSTRAINT photos_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES public.observations(id);

ALTER TABLE public.photos
  ADD CONSTRAINT photos_owner_org_id_fkey FOREIGN KEY (owner_org_id) REFERENCES public.organizations(id);

ALTER TABLE public.photos
  ADD CONSTRAINT photos_pkey PRIMARY KEY (id);

ALTER TABLE public.photos
  ADD CONSTRAINT photos_source_inspection_id_fkey FOREIGN KEY (source_inspection_id) REFERENCES public.inspections(id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.photos TO anon;

GRANT ALL ON public.photos TO authenticated;

GRANT ALL ON public.photos TO service_role;

CREATE INDEX photos_property_id_idx ON public.photos (property_id);

CREATE INDEX photos_observation_id_idx ON public.photos (observation_id);

CREATE INDEX photos_owner_org_id_idx ON public.photos (owner_org_id);

CREATE INDEX photos_source_inspection_id_idx ON public.photos (source_inspection_id);

CREATE TRIGGER photos_set_updated_at
  BEFORE UPDATE ON public.photos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY photos_insert_write ON public.photos
  FOR INSERT
  TO authenticated
  WITH
    CHECK
    ((( SELECT app_private.is_org_member(photos.owner_org_id) AS is_org_member) AND ((source_inspection_id IS NULL) OR ( SELECT
    app_private.can_write_inspection(photos.source_inspection_id) AS can_write_inspection))));

CREATE POLICY photos_select_owner ON public.photos
  FOR SELECT
  TO authenticated
  USING (( SELECT app_private.is_org_member(photos.owner_org_id) AS is_org_member));

CREATE POLICY photos_update_write ON public.photos
  FOR UPDATE
  TO authenticated
  USING (( SELECT app_private.is_org_member(photos.owner_org_id) AS is_org_member))
  WITH CHECK (( SELECT app_private.is_org_member(photos.owner_org_id) AS is_org_member));

CREATE TABLE public.profiles (
  id           uuid                     NOT NULL,
  display_name text,
  locale       text                     DEFAULT 'nl'::text NOT NULL,
  created_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at   timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.profiles(id);

ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.profiles(id);

ALTER TABLE public.observations
  ADD CONSTRAINT observations_observer_id_fkey FOREIGN KEY (observer_id) REFERENCES public.profiles(id);

ALTER TABLE public.org_members
  ADD CONSTRAINT org_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles TO anon;

GRANT ALL ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY profiles_select_self_or_org ON public.profiles
  FOR SELECT
  TO authenticated
  USING (((id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (public.org_members mine
     JOIN public.org_members theirs ON ((theirs.org_id = mine.org_id)))
  WHERE ((mine.user_id = ( SELECT auth.uid() AS uid)) AND (theirs.user_id = profiles.id))))));

CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.properties (
  id                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  home_org_id           uuid                     NOT NULL,
  created_by_org_id     uuid                     NOT NULL,
  postcode              text                     NOT NULL,
  house_number          text                     NOT NULL,
  house_number_addition text,
  city                  text,
  property_type         text,
  build_year            integer,
  bag_id                text,
  created_at            timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at            timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.properties
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.properties
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_created_by_org_id_fkey FOREIGN KEY (created_by_org_id) REFERENCES public.organizations(id);

ALTER TABLE public.properties
  ADD CONSTRAINT properties_home_org_id_fkey FOREIGN KEY (home_org_id) REFERENCES public.organizations(id);

ALTER TABLE public.properties
  ADD CONSTRAINT properties_pkey PRIMARY KEY (id);

ALTER TABLE public.assets
  ADD CONSTRAINT assets_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.floors
  ADD CONSTRAINT floors_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);

ALTER TABLE public.observations
  ADD CONSTRAINT observations_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);

ALTER TABLE public.photos
  ADD CONSTRAINT photos_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.properties TO anon;

GRANT ALL ON public.properties TO authenticated;

GRANT ALL ON public.properties TO service_role;

CREATE INDEX properties_created_by_org_id_idx ON public.properties (created_by_org_id);

CREATE INDEX properties_home_org_id_idx ON public.properties (home_org_id);

CREATE INDEX properties_postcode_house_number_idx ON public.properties (postcode, house_number);

CREATE TRIGGER properties_set_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY properties_insert_member ON public.properties
  FOR INSERT
  TO authenticated
  WITH
    CHECK
    ((( SELECT app_private.is_org_member(properties.created_by_org_id) AS is_org_member) AND ( SELECT (app_private.is_org_member(properties.home_org_id) OR (properties.home_org_id
    = properties.created_by_org_id)))));

CREATE POLICY properties_select_access ON public.properties
  FOR SELECT
  TO authenticated
  USING (( SELECT app_private.can_access_property(properties.id) AS can_access_property));

CREATE POLICY properties_update_access ON public.properties
  FOR UPDATE
  TO authenticated
  USING (( SELECT app_private.can_access_property(properties.id) AS can_access_property))
  WITH CHECK (( SELECT app_private.can_access_property(properties.id) AS can_access_property));

CREATE TABLE public.property_assignments (
  id          uuid                            DEFAULT gen_random_uuid() NOT NULL,
  property_id uuid                            NOT NULL,
  org_id      uuid                            NOT NULL,
  role        public.property_assignment_role DEFAULT 'inspector'::public.property_assignment_role NOT NULL,
  active_from timestamp with time zone        DEFAULT timezone('utc'::text, now()) NOT NULL,
  active_to   timestamp with time zone,
  created_at  timestamp with time zone        DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at  timestamp with time zone        DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.property_assignments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.property_assignments
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.property_assignments
  ADD CONSTRAINT property_assignments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.property_assignments
  ADD CONSTRAINT property_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.property_assignments
  ADD CONSTRAINT property_assignments_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

ALTER TABLE public.property_assignments
  ADD CONSTRAINT property_assignments_property_id_org_id_key UNIQUE (property_id, org_id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.property_assignments TO anon;

GRANT ALL ON public.property_assignments TO authenticated;

GRANT ALL ON public.property_assignments TO service_role;

CREATE INDEX property_assignments_property_id_idx ON public.property_assignments (property_id);

CREATE INDEX property_assignments_org_id_idx ON public.property_assignments (org_id);

CREATE INDEX property_assignments_active_idx ON public.property_assignments (org_id, property_id)
  WHERE active_to IS NULL;

CREATE TRIGGER property_assignments_set_updated_at
  BEFORE UPDATE ON public.property_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY property_assignments_select_access ON public.property_assignments
  FOR SELECT
  TO authenticated
  USING
    ((( SELECT app_private.is_org_member(property_assignments.org_id) AS is_org_member) OR ( SELECT app_private.can_access_property(property_assignments.property_id) AS
    can_access_property)));

CREATE POLICY property_assignments_write_admin ON public.property_assignments
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

CREATE TABLE public.rooms (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  floor_id    uuid                     NOT NULL,
  property_id uuid                     NOT NULL,
  room_type   text                     NOT NULL,
  label       text,
  sort_order  integer                  DEFAULT 0 NOT NULL,
  created_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at  timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.rooms
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rooms
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES public.floors(id) ON DELETE CASCADE;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.rooms TO anon;

GRANT ALL ON public.rooms TO authenticated;

GRANT ALL ON public.rooms TO service_role;

CREATE INDEX rooms_floor_id_idx ON public.rooms (floor_id);

CREATE INDEX rooms_property_id_idx ON public.rooms (property_id);

CREATE TRIGGER rooms_set_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY rooms_select_access ON public.rooms
  FOR SELECT
  TO authenticated
  USING (( SELECT app_private.can_access_property(rooms.property_id) AS can_access_property));

CREATE POLICY rooms_write_access ON public.rooms
  TO authenticated
  USING (( SELECT app_private.can_access_property(rooms.property_id) AS can_access_property))
  WITH CHECK (( SELECT app_private.can_access_property(rooms.property_id) AS can_access_property));

CREATE TABLE public.tenants (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name       text                     NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.tenants
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenants
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.tenants TO anon;

GRANT ALL ON public.tenants TO authenticated;

GRANT ALL ON public.tenants TO service_role;

CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY tenants_select_member ON public.tenants
  FOR SELECT
  TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM public.organizations o
  WHERE ((o.tenant_id = tenants.id) AND ( SELECT app_private.is_org_member(o.id) AS is_org_member)))));

CREATE VIEW public.facts WITH (security_invoker=true) AS SELECT DISTINCT ON (property_id, subject_type, subject_id, attribute_key, owner_org_id) id AS source_observation_id,
    property_id,
    subject_type,
    subject_id,
    attribute_key,
    owner_org_id,
    value,
    observed_at,
    updated_at,
    visibility,
    inspection_id
   FROM public.observations o
  ORDER BY property_id, subject_type, subject_id, attribute_key, owner_org_id, updated_at DESC, observed_at DESC, id DESC;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.facts TO anon;

GRANT ALL ON public.facts TO authenticated;

GRANT ALL ON public.facts TO service_role;