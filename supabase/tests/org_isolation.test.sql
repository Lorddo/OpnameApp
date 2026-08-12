-- pgTAP: org isolation smoke tests
-- Run via: npx supabase test db

begin;
select plan(4);

-- Setup: two orgs under one tenant (as postgres / bypass RLS)
insert into public.tenants (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Test Tenant');

insert into public.organizations (id, tenant_id, name, org_type)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Org A', 'inspection'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Org B', 'inspection');

insert into public.properties (
  id, home_org_id, created_by_org_id, postcode, house_number, city
) values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '1234AB',
  '1',
  'Amsterdam'
);

select has_table('public', 'properties', 'properties table exists');
select has_table('public', 'observations', 'observations table exists');
select has_view('public', 'facts', 'facts view exists');

-- Without JWT context, authenticated should see zero rows via RLS helpers
set local role authenticated;
select is(
  (select count(*)::int from public.properties),
  0,
  'authenticated without membership sees no properties'
);
reset role;

select * from finish();
rollback;
