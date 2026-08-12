# Workflows

**Status:** productvoorstel / offertefase  
**Laatst bijgewerkt:** 2026-08-12

---

## Opnameflow (veld)

De veldapp presenteert geen “vragenlijst”, maar **onderdelen die de opnemer doorloopt** (woonlagen, ruimtes, installaties, …). Technisch blijven het attributes achter die onderdelen. Condities en verplichting: [template-config.md](./template-config.md).

### Typische flow (BBMI / vergelijkbaar)

1. **Project starten**
   - Offline: postcode, huisnummer, toevoeging (Property lokaal)
   - Online: toegewezen/gesyncte opdracht selecteren
2. **Woonlagen** — aantal lagen vastleggen
3. **Ruimtes per woonlaag** — alleen roomTypes uit de template-catalogus (ook types zonder vragen; mag op meerdere lagen, bv. bergruimte)
4. **Ruimte-overzicht** — per ruimte checklist openen; checkmark als alle *zichtbare* template-vragen voor die ruimte beantwoord zijn
5. **Afronden** — alle ruimtes compleet → project in sync-lijst (**Pending sync**)
6. **Upload** — bij bereik: sync naar database

Vanaf fase 2: stappen 1–5 ook volledig offline. Zie [offline-sync.md](./offline-sync.md).

### Compleetheid

- Verplicht = **zichtbaar** (`showWhen`) én in de gepinde template
- Verborgen vragen tellen niet mee; antwoorden wissen als de conditie false wordt
- RoomType zonder vragen = direct checkmark na toevoegen

---

## Offline werkflow (fase 2+)

1. Online inloggen  
2. Templates synchroniseren  
3. Projecten / toegewezen objecten synchroniseren  
4. Offline werken  
5. Observations lokaal opslaan  
6. Foto’s lokaal opslaan (gecomprimeerd)  
7. Synchroniseren wanneer internet beschikbaar is  

UI-status per project: **Concept** / **Pending sync** / **Gesynchroniseerd** / **Syncfout**.

---

## Inspection lifecycle

| Fase | Gedrag |
|---|---|
| Create | Mag offline (fase 2+); client-UUID; `owner_org_id` = huidige org |
| Start | `templateVersion` pinnen; template bepaalt verplichte attributes/foto’s |
| Capture | Writes → lokale opslag → sync queue (niet direct “server-only”) |
| Sync | Nieuw → create; bestaand → update; idempotent op client-ids |
| Complete | Compleetheid t.o.v. gepinde template; export/dossier-view beschikbaar via API |

Antwoorden landen als Observations onder de eigenaar; geen stille overschrijving van andermans claims. Zie [business-rules.md](./business-rules.md).

---

## Dossier / export workflow

1. Property + zichtbare Facts/Observations/Photos ophalen (org-scope)
2. Optioneel filteren op template (BBMI / WWS compleetheid)
3. Export / dossier-payload via API voor klantdashboard
4. Rapportgeneratie gebeurt **buiten** dit platform (klantdashboard)

Een dossier is een **view**, geen aparte bron van waarheid. Zie [data-model.md](./data-model.md).

---

## Cross-org delen (richting)

- Property kan herkenbaar/deelbaar zijn tussen orgs
- Inspectieresultaten delen alleen via expliciete `visibility` / shares
- Company-wissel: geen automatische overname van bestaande inspectiedata

Uitwerking van share-UI is meerwerk; datamodel heeft hooks vanaf dag 1. Zie [ADR-003-multi-tenant.md](./decisions/ADR-003-multi-tenant.md).

---

## Zie ook

- [template-config.md](./template-config.md)
- [offline-sync.md](./offline-sync.md)
- [api-contracts.md](./api-contracts.md)
- [architecture.md](./architecture.md) — fasen
