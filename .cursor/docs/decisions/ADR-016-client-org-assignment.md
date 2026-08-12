# ADR-016: Opdrachtgever en toewijzing

**Status:** Akkoord  
**Datum:** 2026-08-12  
**Gerelateerd:** [ADR-003](./ADR-003-multi-tenant.md), [ADR-008](./ADR-008-api-boundary.md)

---

## Context

Uitvoerende partijen (inspectiebureau, ZZP, makelaar) loggen in op de PWA. Opdrachtgevers (corporatie, makelaar-als-opdrachtgever) loggen in de MVP **niet** in; hun resultaten leest Pranimate via de API/dashboard. Objecten komen uit het veld óf via het dashboard.

## Besluit

- `organizations.org_type`: `inspection` | `client` | `platform`.
- `properties.home_org_id` = opdrachtgever-org; `created_by_org_id` = wie het object aanmaakte.
- `property_assignments` geeft een inspection-org actieve toegang tot een client-object.
- `inspections.owner_org_id` = uitvoerende org; `client_org_id` = opdrachtgever van díe opname.
- Dashboard-toegang: **API-keys** (gehasht, org-scoped) naast gebruikers-JWT.
- MVP-visibility blijft praktisch `private`; `public_to_client` is een modelhook zonder share-UI.

## Consequenties

- RLS: property zichtbaar bij home/created/actieve assignment.
- Inspector ziet/bewerkt eigen opnames; org-admin alles binnen de org; property-structuur is org-breed leesbaar via access-helper.

## Alternatieven (verworpen)

- Opdrachtgever alleen als stringveld — blokkeert latere login zonder migratie.
- Alleen JWT voor dashboard — ongeschikt voor machine-to-machine.
