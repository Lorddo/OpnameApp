# ADR-004: Config-driven platform (templates)

**Status:** Akkoord  
**Datum:** 2026-08-10  
**Bijgewerkt:** 2026-08-12  
**Gerelateerd:** [vision.md](../vision.md), [architecture.md](../architecture.md), [template-config.md](../template-config.md), [ADR-002-observations-model.md](./ADR-002-observations-model.md)

---

## Context

De eerste oplevering vraagt BBMI en WWS. Zonder platformkeuze ontstaat druk om per inspectietype een app of schema te bouwen. Latere types (EPA, NEN 2580, WO, BOG, brandveiligheid, …) moeten zonder herbouw kunnen.

## Besluit

- Bouw een **generiek vastgoed- en inspectieplatform**, geen BBMI-/WWS-/EPA-app
- Inspectietypes = **templates** (configuratie) over een gedeelde attribute-catalogus
- Scope geldt voor **elk type vastgoed** (niet alleen wonen)
- BBMI (fase 3) en WWS (fase 4) zijn de eerste templates; overige types = meerwerk op hetzelfde platform
- Veld-UX: **onderdelen doorlopen** (lagen → ruimtes → checklist), geen “vragenlijst”-framing (technisch wel attributes)
- Attribute-key = `{answerScope}.{questionKey}` (`room` \| `floor` \| `property` \| `asset`)
- Zichtbaarheid via `showWhen` (scoped targets, bv. `room.this.*`; later floor/property/cross-room) — grammar in [template-config.md](../template-config.md)
- Verplicht = zichtbaar én in gepinde template; verborgen antwoorden wissen

## Consequenties

- Geen hardcoded screens per inspectietype; template-engine + versioned catalogus
- Nieuwe inspectietypes = config/meerwerk, geen nieuwe applicatie
- Attribute-sets voor BBMI/WWS moeten met de klant worden afgestemd
- Parser bouwen op volledige `showWhen`-grammar; MVP mag selectors beperken, syntax niet later wijzigen

## Alternatieven (verworpen)

- Losse apps per inspectietype — niet schaalbaar, dubbele data
- Één monolithische “BBMI-first” codebase die later “generiek” wordt — te dure migratie
- Genummerde vervolgvragen (`1.1` / `1.2`) als engine — breekbaar; gebruik `sortOrder` + `showWhen`
