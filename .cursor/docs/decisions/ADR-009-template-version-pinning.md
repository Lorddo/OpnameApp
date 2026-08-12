# ADR-009: Template version pinning

**Status:** Akkoord  
**Datum:** 2026-08-10  
**Gerelateerd:** [data-model.md](../data-model.md), [workflows.md](../workflows.md), [ADR-004-config-driven-platform.md](./ADR-004-config-driven-platform.md)

---

## Context

Templates (BBMI, WWS, …) evolueren: verplichte velden, foto-eisen, labels. Offline openstaande opnames mogen niet stilzwijgend van validatieregels veranderen terwijl de opnemer halverwege is.

## Besluit

- Bij **start van een opname** wordt de `templateVersion` **vastgezet (pinnen)**
- Offline openstaande opnames blijven op die gepinde versie
- Templates beschrijven welke data nodig is; ze bevatten geen opname-data
- Compleetheid / dossier-view meet t.o.v. de gepinde versie van die Inspection

## Consequenties

- Template-publicatie mag bestaande openstaande opnames niet breken
- Migratie/upgrade van open inspections is een expliciete actie (later uitwerken indien nodig)
- Attribute-catalogus en template-configs moeten versioned zijn

## Alternatieven (verworpen)

- Altijd “latest template” live toepassen — breekt offline en mid-inspection validatie
- Template-inhoud kopiëren als losse snapshot zonder version-id — moeilijk te auditen/vergelijken
