# ADR-017: Multi-device sync scope + silent LWW UX

**Status:** Akkoord  
**Datum:** 2026-08-13  
**Gerelateerd:** [ADR-001-offline-first.md](./ADR-001-offline-first.md), [ADR-014-facts-as-view.md](./ADR-014-facts-as-view.md), [offline-sync.md](../offline-sync.md)

---

## Context

De offerte noemt “meerdere devices op hetzelfde project”. Dat kan betekenen: (A) meerdere inspecteurs werken in **één gedeelde inspection**, of (B) meerdere inspecteurs doen **aparte inspections** op hetzelfde object (property). Daarnaast moest de UX bij LWW-conflicten tussen devices worden vastgelegd.

## Besluit

1. **Geen shared inspection.** Eén inspection behoort tot één inspecteur (eigenaar/assignee). Collega’s werken niet tegelijk in dezelfde inspection-rij.
2. **Multi-device / multi-inspecteur op één property** = meerdere **aparte inspections** (en hun observations) op hetzelfde object. Facts blijven LWW binnen `owner_org_id` over die history.
3. **LWW-conflict UX (MVP):** stil overschrijven. De nieuwste observation wint in de facts-view; oudere rijen blijven in history. Geen conflict-melding in de PWA in fase 2.
4. LWW tussen devices op **dezelfde** inspection blijft zeldzaam (zelfde persoon, twee devices). Dat is toegestaan; stil LWW geldt daar ook.

## Consequenties

- UI en sync hoeven geen “lock” of merge-UX voor gedeelde opnames
- Pull/push blijven org-scoped; inspecteurs zien vooral eigen/toegewezen inspections
- Rijke conflict-UX (melding, side-by-side) = latere optie / meerwerk

## Alternatieven (verworpen)

- Realtime co-editing van één inspection door meerdere inspecteurs — complexiteit zonder MVP-noodzaak
- Conflict-toast bij elke LWW — ruis in het veld; history dekt audit al af
