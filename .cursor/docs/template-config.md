# Template-config (checklist / attributes)

**Status:** productvoorstel / uitwerking BBMI-checklist  
**Laatst bijgewerkt:** 2026-08-12  
**Bron van waarheid (BBMI):** [`templates/bbmi/0.1.0.json`](../../templates/bbmi/0.1.0.json)

Templates beschrijven **welke data nodig is** en **wanneer** een vraag zichtbaar/verplicht is. Ze bevatten geen opname-data. Zie ook [ADR-004](./decisions/ADR-004-config-driven-platform.md) en [ADR-009](./decisions/ADR-009-template-version-pinning.md).

---

## Bestandsindeling

```text
templates/
  bbmi/
    0.1.0.json    ← gepinde templateVersion bij start opname
  wws/
    …             ← later
```

Één JSON-bestand per template-versie. Pin `id` + `version` op de Inspection.

### Top-level

| Veld | Rol |
|---|---|
| `id` | Template-id (`bbmi`, `wws`, …) |
| `version` | Semver-achtige versie (`0.1.0`) |
| `label` | Weergavenaam |
| `locale` | Taal van labels (`nl-NL`) |
| `attributes` | Catalogus van unieke vragen (1× gedefinieerd) |
| `roomTypes` | Selecteerbare ruimtesoorten + welke attributes ze gebruiken |

---

## Attributes (catalogus)

Key in het object = **attributeKey** = `{answerScope}.{questionKey}` (ook opslagkey op Observations).

| Veld | Rol |
|---|---|
| `answerScope` | `room` \| `floor` \| `property` \| `asset` |
| `questionKey` | Stabiele id (camelCase) |
| `label` | UI-vraagtekst |
| `answerType` | `boolean` \| `choice` \| `text` \| `number` \| … |
| `options` | Alleen bij `choice`: `[{ value, label }]` |
| `helpText` | Standaard toelichting |

Zelfde attributeKey = **zelfde betekenis** overal. Geen gedupliceerde vraagteksten per roomType.

---

## RoomTypes

| Veld | Rol |
|---|---|
| `id` | Stabiele slug (`serre`, `externeBergruimte`, …) |
| `label` | UI-naam bij ruimte-selectie |
| `allowMultiplePerFloor` | Mag meerdere keren op dezelfde woonlaag |
| `questions` | Bindings naar attributes (volgorde + template-specifieke overrides) |

### Question-binding

| Veld | Rol |
|---|---|
| `attributeKey` | Verwijzing naar `attributes` |
| `sortOrder` | Weergavevolgorde in de room-checklist |
| `photoRequired` | Fotoverplichting voor deze binding |
| `showWhen` | Optionele zichtbaarheidsconditie |
| `helpTextOverride` | Optioneel: afwijkende helptekst alleen in deze context |

RoomType zonder `questions` (of lege lijst) → direct checkmark na toevoegen.

---

## Verplichtheid en zichtbaarheid

| Regel | Betekenis |
|---|---|
| Verplicht | Vraag is **zichtbaar** én opgenomen in de gepinde template |
| Verborgen | Telt niet mee voor compleetheid / checkmark |
| Antwoord wissen | Als `showWhen` false wordt: bestaand antwoord wissen (geen ghost-data bij sync) |

MVP (BBMI): condities evalueren vooral op **dezelfde room** (`room.this.*`). De parser en syntax zijn voorbereid op floor / property / cross-room.

---

## `showWhen`-syntax

```text
<target> <op> <value> [AND|OR ...]
```

### Targets

| Target | Betekenis | Fase |
|---|---|---|
| `room.this.<questionKey>` | Huidige ruimte | Nu |
| `floor.this.<questionKey>` | Huidige verdieping | Later |
| `property.this.<questionKey>` | Pandbreed | Later |
| `asset.this.<questionKey>` | Huidig asset | Later |
| `room.any(roomType=<type>).<questionKey>` | Willekeurige matching room | Later |
| `room.all(roomType=<type>).<questionKey>` | Alle matching rooms | Later |
| `room.ref(<roomId>).<questionKey>` | Specifieke room | Later |

### Operators en waarden

- Ops: `=` `!=` `>` `>=` `<` `<=` `in`
- Values: `true` / `false` / getal / `"tekst"` / choice-`value`
- Combineren: `AND` / `OR` en haakjes

### Voorbeelden

```text
room.this.plafondHoogteMin190 = false

property.this.bouwjaar >= 1990

room.any(roomType=serre).geisoleerd = true

room.this.geisoleerd = true AND room.this.afgeslotenRuimte = true
```

**Implementatienote:** parser accepteert de volledige grammar; niet-ondersteunde selectors in MVP → duidelijke fout — **geen** nieuwe syntax later introduceren.

---

## BBMI-afspraken (huidige template)

- Onderling uitsluitende booleans vermijden waar één boolean volstaat (externe bergruimte: alleen `binnendoorBereikbaar`; nee = alleen via buiten).
- Geen genummerde tree (`1.1` / `1.2`) als engine; volgorde = `sortOrder`, branching = `showWhen`.
- `bergruimte` selecteerbaar op meerdere lagen; checklist vraagt `locatieInPand`.

---

## Zie ook

- [workflows.md](./workflows.md) — veldflow (lagen → ruimtes → checklist)
- [data-model.md](./data-model.md) — attributes / observations
- [business-rules.md](./business-rules.md) — template- en zichtbaarheidsregels
