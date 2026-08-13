# Business rules

**Status:** productvoorstel / offertefase  
**Laatst bijgewerkt:** 2026-08-12

---

## Data-eigenaarschap

| Laag | Regel |
|---|---|
| Juridisch / commercieel | Inmeter, inspecteur of opdrachtgevende org blijft eigenaar van bronbestanden en opnamedata — niet de softwareleverancier |
| Platform | Observations blijven bestaan; elke claim/foto/inspectie heeft `owner_org_id` |
| Portabiliteit | Export en meeneembaarheid; geen vendor lock-in op data |
| Leveranciersrol | Verwerker/bewaarder van platformdata, geen eigenaar van bronbestanden |

---

## Visibility

| Waarde | Betekenis |
|---|---|
| `private` | Alleen zichtbaar voor de eigenaar-org |
| `shared` | Zichtbaar voor orgs met expliciete share/grant |
| `public_to_client` | Zichtbaar voor de opdrachtgever/client-org van deze opname |

Default voor Observation / Photo: `private` (of gelijk aan bron-inspectie).  
Delen gebeurt alleen via expliciete visibility/shares — nooit stilzwijgend.

---

## Fysiek object vs. inspectieresultaat

| Entiteit | Regel |
|---|---|
| Property (ruimtes, installaties, pandkenmerken) | Mag centraal bestaan en herkenbaar blijven over partijen |
| Inspection / Observation / Photo / rapportdata | Eigenaar-gebonden; niet automatisch beschikbaar voor andere orgs |

---

## Company-wissel

Bij wissel van company/organisatie:

- Bestaande observations / foto’s / facts van de vorige org worden **niet automatisch** opgenomen in zichtbare of geconsolideerde data van de nieuwe partij
- “Niet zichtbaar voor andere org” ≠ “verwijderen” — history blijft bewaard voor audit/export/juridische herleidbaarheid

---

## Observations vs Facts

- Observations zijn **claims** (tijd, bron, eigenaar, visibility) — niet eeuwige feiten
- Facts = geconsolideerde “huidige waarde” op Property **binnen wat de raadplegende org mag zien**
- Consolidatie gebruikt alleen observations die die org mag zien

### Wat “consolidatie” betekent (MVP)

Meerdere observations kunnen hetzelfde attribute raken (andere inspectie, andere dag, andere device).  
Het **fact** is het antwoord dat de UI/API toont als actuele waarde.

**MVP-regel:** last-write-wins op veldniveau **binnen dezelfde `owner_org_id`**. Oudere observations blijven bewaard (history/audit).

Voorbeeld: org A zet `property.roofInsulationPresent = true`, later zet org A het op `false` → fact voor A = `false`.  
Org B ziet dat niet, tenzij visibility/share dat toelaat (niet in MVP).

### Delen (MVP)

- Geen cross-org fact-deling in de PWA
- Data is beschikbaar voor het **klantdashboard via API/JSON-export** (hun leespad)
- `visibility`-hooks blijven in het model; share-UI / org-tot-org delen = later / meerwerk

### Conflictregel (initiële oplevering)

Veld-niveau **last-write-wins** **binnen dezelfde eigenaarscope** + audittrail (eerdere observations blijven bewaard).

### Later

Reviewer-beslissing / goedkeuringsflow waar nodig; fijnmazige consolidatieregels per attribute indien nodig.

---

## Templates

- Templates bevatten geen opname-data; ze beschrijven welke data nodig is
- Bij start van een opname: **templateVersion pinnen**
- Offline openstaande opnames blijven op die versie
- Meerdere templates mogen hetzelfde attribute vullen
- **Verplicht** = attribute is zichtbaar volgens `showWhen` **én** zit in de gepinde template
- Verborgen attributes tellen niet mee voor compleetheid; bij false-conditie: antwoord wissen (geen sync van ghost-data)
- Zelfde `{answerScope}.{questionKey}` = dezelfde betekenis over roomTypes heen
- Conditie-syntax en kolommen: [template-config.md](./template-config.md)

---

## Photos

- Bewijs gekoppeld aan subject (`Property | Floor | Room | Asset | Observation`)
- Traceerbaar via `sourceInspectionId`
- Zelfde eigenaarschap/visibility als bron
- Client-side compressie vóór sync (start: max 1920px lange zijde, JPEG ~0.72; SHA-256 checksum op blob)
- Opslag: `storageProvider` + `storageKey` in Postgres; blob in R2 (MVP)

---

## Dossier

- Geen aparte bron van waarheid
- View/export over Property + Facts/Observations/Photos binnen org-zichtbaarheid
- Rapportgeneratie buiten scope (klantdashboard)

---

## Pandbrede kenmerken

Gevels, dak, algemene isolatie e.d. → Property-scope attributes.  
Geen aparte `Facade`-entiteit tenzij later herhaalbare subjects nodig blijken.

---

## Nog uit te werken

- Exact share-model (rollen, scope) — rollen-detail tijdens dev; cross-org delen later
- ~~Retentie / storage-lifecycle foto’s~~ — ADR-018
- Contractuele formulering data-eigenaarschap / verwerkersrol wanneer DPA of hosting-overdracht speelt

Zie [ADR-002-observations-model.md](./decisions/ADR-002-observations-model.md) en [ADR-003-multi-tenant.md](./decisions/ADR-003-multi-tenant.md).
