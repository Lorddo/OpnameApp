# ADR-005: Property as source of truth

**Status:** Akkoord  
**Datum:** 2026-08-10  
**Gerelateerd:** [data-model.md](../data-model.md), [business-rules.md](../business-rules.md), [ADR-002-observations-model.md](./ADR-002-observations-model.md)

---

## Context

Klanten denken in dossiers en rapporten. Als die documenten de bron van waarheid worden, ontstaat duplicatie en geen hergebruik tussen inspecties op hetzelfde object.

## Besluit

- **Property** (het vastgoedobject) is de bron van waarheid — niet het rapport, de inspectie of de vragenlijst
- Observations leggen claims vast; Facts consolideren zichtbare waarheid per org
- Een **dossier is een view/export** over Property + Facts/Observations/Photos — geen aparte waarheid
- Pandbrede kenmerken (gevel, dak, …) leven als **property-scope attributes**, geen aparte `Facade`-entiteit tenzij later herhaalbare subjects nodig zijn
- Fysieke structuur (floors/rooms/assets) mag herkenbaar blijven; inspectieresultaten blijven eigenaar-gebonden

## Consequenties

- Rapportgeneratie consumeert API/export; bouwt geen parallel datamodel
- Compleetheid = vergelijking property-data t.o.v. een template
- Hergebruik van objectdata over opeenvolgende inspecties is het default pad

## Alternatieven (verworpen)

- Inspection/rapport als master — blokkeert hergebruik en multi-template
- Dossier-entiteit als bron van waarheid — duplicatie van property-data
