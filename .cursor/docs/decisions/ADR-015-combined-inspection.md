# ADR-015: Gecombineerde opname (meerdere template-pins)

**Status:** Akkoord  
**Datum:** 2026-08-12  
**Gerelateerd:** [ADR-009](./ADR-009-template-version-pinning.md), [workflows.md](../workflows.md)

---

## Context

BBMI en WWS (later meer) delen vaak dezelfde attributes. De inspecteur wil per veldopname meerdere inspectietypes aanvinken en per ruimte **één** samengevoegde checklist zien, terwijl compleetheid per type meetbaar blijft.

## Besluit

- Eén `inspections`-rij = één veldopname.
- Koppeltabel `inspection_template_pins (inspection_id, template_key, template_version)` pinnet elke aangevinkte templateversie bij start.
- Observations blijven één keer opgeslagen per `attribute_key` (+ subject); geen duplicatie per template.
- Merge-engine in `packages/core`: roomTypes samenvoegen, vragen ontdubbelen op `attributeKey`, zichtbaarheid/`photoRequired` als OR, compleetheid **per gepind template**.

## Consequenties

- ADR-009 blijft geldig: elke pin heeft een vaste versie.
- Dossier-export toont compleetheid per pin.
- Merge-botsingen (`sortOrder` / `helpTextOverride`) worden gedetecteerd; keuzeregel volgt zodra echte checklist-botsingen zichtbaar zijn.

## Alternatieven (verworpen)

- Aparte inspection per template — dubbele UI en herhaalde vragen.
- Één template-veld op inspection — blokkeert gecombineerde flow.
