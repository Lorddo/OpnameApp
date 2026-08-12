# ADR-002: Observations model

**Status:** Akkoord  
**Datum:** 2026-08-10  
**Gerelateerd:** [data-model.md](../data-model.md), [business-rules.md](../business-rules.md), [diagrams/er-detailed.md](../diagrams/er-detailed.md)

---

## Context

Inspecties overlappen op hetzelfde vastgoedobject. Eerdere schetsen dachten in “Answer op Question”. Dat koppelt data te hard aan één inspectietype en vernietigt hergebruik en audittrail. Klantfeedback vraagt om eigenaarschap: claims zijn van een org, niet stilzwijgend van het platform of een volgende company.

## Besluit

- **Observations blijven** als modelconcept: claims met waarde, tijd, bron, `owner_org_id`, `visibility`, optioneel bewijs
- **Attributes** (niet Questions) vormen de catalogus; templates selecteren subsets
- **Facts** = geconsolideerde waarheid op Property, alleen uit observations zichtbaar voor de raadplegende org
- Templates (BBMI/WWS/…) zijn configuratie over attributes — geen aparte apps of antwoordtabellen per type
- Dossier/rapport = view/export, geen aparte bron van waarheid
- Pandbrede kenmerken = property-scope attributes (geen aparte Facade-entiteit tenzij later nodig)

## Consequenties

- Meerdere templates kunnen hetzelfde attribute vullen
- History blijft bewaard (audit / export / juridische herleidbaarheid)
- Consolidatie is org-scoped; company-wissel neemt geen data stilzwijgend over
- UX toont “onderdelen”, niet “vragenlijst”; technisch blijven het attributes

## Alternatieven (verworpen)

- Answers verwijderen en alleen mutable Facts — verliest audittrail en eigenaarschap
- Per-inspectietype apps/schema’s — breekt platformvisie
- Vragenlijst als primaire UX-framing — conflicteert met producttaal richting klant
