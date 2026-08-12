# ADR-011: Phased delivery

**Status:** Akkoord  
**Datum:** 2026-08-10  
**Gerelateerd:** [architecture.md](../architecture.md), [vision.md](../vision.md)

---

## Context

Het platformpatroon + offline + twee templates is te groot voor “alles tegelijk”. Zonder fasering ontstaat opleverrisico en onduidelijke scope t.o.v. meerwerk (EPA, LiDAR, share-UI, …).

## Besluit

Oplevering in **4 fasen**:

| Fase | Focus |
|---|---|
| 1 | Engine + PWA (online-first, API, org/RLS-basis, template-engine) |
| 2 | Offline + sync (Dexie, queue, foto-upload, sync-status) |
| 3 | BBMI-template |
| 4 | WWS-template |

Expliciet **meerwerk / buiten fase 1–4**: EPA/NEN2580/WO/BOG/brand, cross-org share UI, LiDAR/native iOS, Realworks-import, partner CSV, dashboard/rapportgenerators, CRDTs, rijke approval-flow.

## Consequenties

- Elke fase levert een bruikbaar tussenproduct
- Offline is geen fase-1-blocker; wel harde eis vanaf fase 2
- Nieuwe templates na WWS volgen hetzelfde patroon zonder architectuurwijziging

## Alternatieven (verworpen)

- Big-bang MVP met offline + BBMI + WWS + dashboard — te hoog risico
- Eerst native/LiDAR, dan platform — keert de afhankelijkheden om
