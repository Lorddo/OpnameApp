# ADR-010: Photos as evidence

**Status:** Akkoord  
**Datum:** 2026-08-10  
**Gerelateerd:** [data-model.md](../data-model.md), [business-rules.md](../business-rules.md), [offline-sync.md](../offline-sync.md)

---

## Context

Foto’s zijn bewijs bij vastgoedopnames. Als ze alleen “aan het project” hangen, zijn ze moeilijk herbruikbaar, slecht te autoriseren, en juridisch lastig te herleiden.

## Besluit

- Foto’s zijn **bewijs**, gekoppeld aan een **subject**: `Property | Floor | Room | Asset | Observation`
- Niet uitsluitend “los aan het project”; wel traceerbaar via `sourceInspectionId`
- Zelfde eigenaarschap als bron: `owner_org_id` + `visibility`
- **Client-side compressie** vóór opslag/sync; blobs immutable; metadata in Postgres (`storageProvider` + `storageKey`); blobs in **R2** (MVP, later switchbaar)
- Bronbestanden blijven juridisch van de klant/opnemende partij; platform biedt export/portabiliteit

## Consequenties

- Upload-queue en compressie horen bij fase 2
- Retentie / storage-lifecycle nog uit te werken
- Templates kunnen fotoverplichting per attribute afdwingen

## Alternatieven (verworpen)

- Alleen project-level photo album — zwakke herleidbaarheid
- Server-side-only compressie zonder client-prep — slecht voor offline/bandbreedte
- Leverancier als eigenaar van bronbestanden — conflicteert met data-eigenaarschap
