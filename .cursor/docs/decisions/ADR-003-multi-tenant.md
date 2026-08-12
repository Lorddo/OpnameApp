# ADR-003: Multi-tenant & ownership

**Status:** Akkoord (o.a. op klantfeedback)  
**Datum:** 2026-08-10  
**Gerelateerd:** [business-rules.md](../business-rules.md), [data-model.md](../data-model.md), [vision.md](../vision.md)

---

## Context

Meerdere organisaties (makelaars, inspecteurs, opdrachtgevers) werken op herkenbare vastgoedobjecten. Juridisch blijft de opnemende/opdrachtgevende partij eigenaar van brondata — niet de softwareleverancier. Stilzwijgende data-overname bij company-wissel is onacceptabel.

## Besluit

- **Multi-tenant ready vanaf dag 1:** `org_id` / tenancy in datamodel + RLS, ook als UI met één org start
- **Ownership First:** Inspection, Observation, Photo hebben `owner_org_id`
- **Visibility:** `private` | `shared` | `public_to_client`; delen alleen expliciet
- **Property** mag centraal/herkenbaar blijven (fysieke identiteit, BAG, structuur); inspectieresultaten niet automatisch
- **Company-wissel:** geen automatische overname van bestaande observations/facts/foto’s
- **Data portability:** export/meeneembaarheid; leverancier = verwerker, geen data-eigenaar
- Uitgewerkte cross-org share UI = meerwerk; hooks in model vanaf dag 1

## Consequenties

- Autorisatie in API + database, niet alleen client
- Facts-consolidatie is per zichtbare eigenaarscope
- SaaS met meerdere opdrachtgevers is structureel mogelijk zonder herbouw
- Exact share-model (rollen, scope) nog uit te werken tijdens implementatie

## Alternatieven (verworpen)

- Single-tenant eerst, later migreren — te duur en risicovol
- Alles publiek binnen platform op gedeeld Property — schendt eigenaarschap
- Leverancier als data-eigenaar — conflicteert met klantbelofte en portabiliteit
