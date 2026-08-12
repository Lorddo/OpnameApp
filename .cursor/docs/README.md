# Documentatie — Vastgoed Opname Platform

Living docs voor ontwikkeling, offertes en besluitvorming.  
Bij conflicten tussen code en docs: eerst de docs bijwerken of expliciet afwijken met reden.

**Status:** goedgekeurd / in uitvoering (kickoff)  
**Laatst bijgewerkt:** 2026-08-12

## Structuur

| Document | Inhoud |
|---|---|
| [vision.md](./vision.md) | Hoofddoel, filosofie, scope (in/out) |
| [architecture.md](./architecture.md) | Principes, stack, API-first, opleverfasen |
| [data-model.md](./data-model.md) | Domeinmodel + verwijzing naar ER-diagrammen |
| [template-config.md](./template-config.md) | Template-JSON: attributes, roomTypes, `showWhen` |
| [workflows.md](./workflows.md) | Opnameflow (lagen → ruimtes → checklist), dossier als view |
| [api-contracts.md](./api-contracts.md) | API-richting, clients, open contractpunten |
| [offline-sync.md](./offline-sync.md) | Offline-first, sync queue, identifiers |
| [business-rules.md](./business-rules.md) | Eigenaarschap, visibility, consolidatie, conflicten |
| [decisions/](./decisions/) | ADRs (001–011) + beslislog |

## Diagrammen

| Diagram | Beschrijving |
|---|---|
| [diagrams/er-detailed.md](./diagrams/er-detailed.md) | ER-diagram (Property / Inspection / Observation + ownership) |
| [diagrams/domain-overview.md](./diagrams/domain-overview.md) | Conceptuele hiërarchie Property → Observations → templates |

## Gerelateerd (buiten deze map)

- `.cursor/docs/Klant communicatie/` — offertes en klantcommunicatie
- `.cursor/docs/platform-architectuur.md` — doorverwijzing naar deze structuur
