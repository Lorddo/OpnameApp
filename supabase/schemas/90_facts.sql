-- LWW facts within owner_org_id scope (ADR-014).
-- security_invoker keeps underlying observations RLS in force.
create or replace view public.facts
with (security_invoker = true)
as
select distinct on (
  o.property_id,
  o.subject_type,
  o.subject_id,
  o.attribute_key,
  o.owner_org_id
)
  o.id as source_observation_id,
  o.property_id,
  o.subject_type,
  o.subject_id,
  o.attribute_key,
  o.owner_org_id,
  o.value,
  o.observed_at,
  o.updated_at,
  o.visibility,
  o.inspection_id
from public.observations o
order by
  o.property_id,
  o.subject_type,
  o.subject_id,
  o.attribute_key,
  o.owner_org_id,
  o.updated_at desc,
  o.observed_at desc,
  o.id desc;

revoke all on public.facts from public;
grant select on public.facts to authenticated, service_role;
