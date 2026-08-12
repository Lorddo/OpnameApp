# ADR-013: i18n NL/EN

**Status:** Akkoord  
**Datum:** 2026-08-12  
**Gerelateerd:** offerte (meertaligheid), [ADR-007](./ADR-007-pwa-first.md)

---

## Context

De offerte eist NL + EN. Technische docs noemden dit nog niet. Veldgebruikers wisselen van taal; copy mag niet hardcoded in componenten zitten.

## Besluit

- `vue-i18n` vanaf fase 0 in `apps/pwa`.
- Standaardtaal: `nl`; fallback: `en`.
- Alle UI-strings via message catalogs (`src/i18n/locales/*.json`).
- Template-labels blijven in de template-`locale` (nu `nl-NL`); vertaling van checklist-inhoud is later/meerwerk tenzij de klant EN-templates aanlevert.

## Consequenties

- Nieuwe schermen leveren altijd NL én EN keys op.
- Taalkeuze zit in Instellingen; later eventueel browser/org-default.

## Alternatieven (verworpen)

- Alleen NL tot fase 5 — breekt offerte-eis en maakt inhaalwerk duurder.
- Per-component hardcoded strings — niet onderhoudbaar.
