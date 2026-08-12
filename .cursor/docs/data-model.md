# Data model

**Status:** in uitvoering (fase 1 schema)  
**Laatst bijgewerkt:** 2026-08-12

---

## Diagrammen

| Diagram | Wanneer gebruiken |
|---|---|
| [diagrams/er-detailed.md](./diagrams/er-detailed.md) | Entiteiten, velden, relaties, ownership/visibility |
| [diagrams/domain-overview.md](./diagrams/domain-overview.md) | Conceptuele hiërarchie Property → subjects → observations → templates |

Bij wijzigingen aan het model: eerst dit document **én** de diagrammen bijwerken.

---

## Hiërarchie (conceptueel)

```text
Tenant
 └─ Organization (org_type: inspection | client | platform)
     ├─ Org members (inspector | admin) → Profile
     ├─ Properties (home_org_id = opdrachtgever; created_by_org_id)
     │    ├─ Property assignments (toegang voor inspection-orgs)
     │    ├─ Floors → Rooms
     │    ├─ Assets
     │    ├─ Photos
     │    └─ Observations → Facts (view)
     └─ Inspections (owner_org_id + client_org_id)
          └─ inspection_template_pins (meerdere templates per opname)
```

Zie [ADR-015](./decisions/ADR-015-combined-inspection.md), [ADR-016](./decisions/ADR-016-client-org-assignment.md), [ADR-014](./decisions/ADR-014-facts-as-view.md).

**Scheiding fysiek vs. inspectieresultaat:**

```text
Property
 ├─ fysieke kenmerken woning / object
 ├─ ruimtes
 └─ installaties

Inspection (+ Observations / Photos)
 ├─ antwoorden / claims
 ├─ foto’s
 ├─ rapportdata / exportviews
 └─ eigenaar (org/company)
```

De woning/het object kan centraal blijven bestaan. Inspectieresultaten zijn van de eigenaar en niet automatisch beschikbaar voor andere organisaties.

Zie [ADR-002-observations-model.md](./decisions/ADR-002-observations-model.md).

---

## Property

Stabiele objectidentiteit voor **elk type vastgoed**:

- Adres als weergave/zoekveld (postcode, huisnummer, toevoeging)
- Object-/gebruikstype (woning, BOG, …) — model is generiek
- Offline: lokaal UUID; adresvelden volstaan voor MVP
- **BAG-lookup / dedupe in onze PWA: buiten scope** — gebeurt in het klantdashboard; optioneel later een door hen aangeleverde BAG-id opslaan
- Toegang: home-org, creating org, of actieve `property_assignments`-rij

**Pandbrede informatie** (geldt voor het gehele object) leeft op Property-niveau als attributes/facts — bijvoorbeeld gevels/gevelkenmerken, dak, algemene isolatie, bouwaard. Geen aparte `Facade`-entiteit nodig tenzij later blijkt dat gevels als herhaalbare subjects moeten bestaan; default = property-scope attributes.

Voorbeelden van property-velden / attributes:

- Adres, postcode, plaats
- Bouwjaar
- Objecttype / woningtype / BOG-type
- BAG-id (optioneel; aangeleverd door dashboard, wij doen geen lookup)
- Pandbrede kenmerken (gevel, dak, …)

---

## Floors / Rooms / Assets

| Entiteit | Voorbeelden |
|---|---|
| Floors | Begane grond, 1e verdieping, zolder |
| Rooms | Woonkamer, keuken, badkamer, kantoorruimte, serre |
| Assets | CV-ketel, warmtepomp, zonnepanelen, ventilatie |

Rooms en assets zijn de **subjects** waarop ruimte-/installatie-attributes en foto’s hangen.  
Pandbrede zaken → Property.

---

## Attributes + UX als onderdelen

Attributes zijn **niet** hard gekoppeld aan BBMI/WWS/EPA.

De bibliotheek is een catalogus van **gestructureerde attributen**. Templates selecteren welke keys nodig zijn. Meerdere templates kunnen hetzelfde attribuut vullen.

**Samenstelling:** `attributeKey` = `{answerScope}.{questionKey}`  
`answerScope`: `room` \| `floor` \| `property` \| `asset`.

| attributeKey | scope | type | Voorbeeld UI-label |
|---|---|---|---|
| `room.geisoleerd` | Room | boolean | Is de ruimte geïsoleerd? |
| `room.klimaatregeling` | Room | boolean | Is er klimaatregeling aanwezig? |
| `room.locatieInPand` | Room | text | Waar bevindt deze bergruimte zich in het pand? |
| `room.plafondHoogteMin190` | Room | boolean | Heeft de ruimte een plafondhoogte van minimaal 1.90 m? |
| `asset.boiler.year` | Asset | number | Bouwjaar ketel |
| `property.roofInsulationPresent` | Property | boolean | Dakisolatie aanwezig? |
| `property.facade.*` | Property | … | Pandbrede gevelkenmerken |

Templates bepalen per attribute o.a.: `sortOrder`, `showWhen`, fotoverplichting, helptekst, validatie.  
Volledige kolommen + `showWhen`-grammar: [template-config.md](./template-config.md).

**Product-UX:** onderdelen doorlopen (lagen → ruimtes → checklist), geen “vragenlijst”-framing. Zie [workflows.md](./workflows.md).

---

## Observations vs Facts

Observations zijn claims met tijd, bron, eigenaar en visibility. Ze worden nooit hard verwijderd.

**Facts** zijn een read-only view: per `(property, subject, attribute_key, owner_org_id)` de laatste observation (LWW). Zie [ADR-014](./decisions/ADR-014-facts-as-view.md).

---

## Inspections + template pins

Eén inspection = één veldopname. Aangevinkte inspectietypes (BBMI, WWS, …) staan in `inspection_template_pins` met gepinde `template_key` + `template_version`. Compleetheid wordt per pin berekend over gedeelde observations. Zie [ADR-015](./decisions/ADR-015-combined-inspection.md).

---

## Auth / toegang

- Mensen: Supabase Auth + JWT; org/rol in `app_metadata`.
- Dashboard (machine): gehashte `api_keys` scoped op org. Zie [ADR-016](./decisions/ADR-016-client-org-assignment.md).

Observations worden **niet verwijderd** als modelconcept. Ze zijn claims, geen eeuwige feiten:

- waarde
- `observedAt`
- `observerId`
- `owner_org_id` (**eigenaarschaplaag** — company/org die de claim bezit)
- `visibility` (`private` | `shared` | `public_to_client`) — MVP gebruikt `private`
- `sourceInspectionId` (optioneel)
- bewijs (foto’s)

| visibility | Betekenis |
|---|---|
| `private` | Alleen zichtbaar voor de eigenaar-org |
| `shared` | Zichtbaar voor orgs met expliciete share/grant (later) |
| `public_to_client` | Modelhook; opdrachtgevers lezen via dashboard-API |

Gedetailleerde regels: [business-rules.md](./business-rules.md).

---

## Photos

Foto’s zijn bewijsvoering en volgen hetzelfde eigenaarschap als de observation/inspectie waaruit ze komen.

- Gekoppeld aan een **subject**: `Property | Floor | Room | Asset | Observation`
- Niet “los aan het project” als enige koppeling
- Wel traceerbaar via `sourceInspectionId`
- `owner_org_id` + `visibility` (default: zelfde als bron-observation/inspectie)
- Gecomprimeerd aan de client-kant vóór opslag/sync
- Blob-metadata in Postgres:
  - `storageProvider` — bv. `r2` (MVP); later eventueel `supabase`
  - `storageKey` — stabiele object-key in die store (geen vendor-URL als bron van waarheid)
- Bronbestanden blijven juridisch van de klant/opnemende partij; platform biedt export/portabiliteit

---

## Templates en templateVersion

Templates beschrijven **welke data nodig is**, ze bevatten geen opname-data.

Bij start van een opname worden aangevinkte **templateVersions vastgezet** in `inspection_template_pins`.  
Offline openstaande opnames blijven op die versies.

Config-details (roomTypes, `questionKey`, `answerScope`, `showWhen`, verplichtheid): [template-config.md](./template-config.md).

---

## Projects / Inspections

- Mogen **offline aangemaakt** worden (vanaf fase 2)
- Lokale unieke identifier (UUID) bij creatie
- Sync: nieuw → create op server; bestaand → update
- Nooit afhankelijk van internet om een opname te starten (na fase 2)
- Elke Inspection heeft `owner_org_id` (uitvoerend) en optioneel `client_org_id` (opdrachtgever)
- Antwoorden landen als Observations onder die eigenaar; niet als stille overschrijving van andermans claims

---

## Multi-tenant, eigenaarschap en delen

Iedere organisatie heeft eigen gebruikers, projecten en (standaard) eigen inspectiedata.

**Property** mag centraal / herkenbaar blijven (fysieke identiteit, structuur).  
**Observations, foto’s en rapportdata** hebben een eigenaar en zijn default privé.

Objecttoegang tussen opdrachtgever en uitvoerder loopt via `property_assignments` (MVP). Delen van inspectieresultaten blijft visibility/share-hooks zonder share-UI in MVP.

Conceptueel:

- `home_org_id` / `created_by_org_id` op Property
- `owner_org_id` op Inspection, Observation, Photo
- `visibility`: `private` | `shared` | `public_to_client`
- **Company-wissel:** geen automatische overname van bestaande observations/facts/foto’s

Zie [ADR-003-multi-tenant.md](./decisions/ADR-003-multi-tenant.md) en [ADR-016](./decisions/ADR-016-client-org-assignment.md).

---

## Dossier (view / export)

De klant denkt in een “dossier”: één bundel gegevens + bewijs per object.

In onze architectuur is een **dossier geen aparte bron van waarheid**, maar een **view/export** over Property + Facts/Observations + Photos die de raadplegende org mag zien (compleetheid per gepind template).

Rapportgeneratie zelf hoort bij het **klantdashboard** (buiten scope); wij leveren de data via API/export zodat zij rapporten kunnen maken.

---

## Nog uit te werken (implementatie)

- Exact share-model (rollen, scope) — tijdens dev; cross-org delen later
- Concrete attribute-sets voor BBMI (fase 3) en WWS (fase 4) — BBMI: [`templates/bbmi/0.1.0.json`](../../templates/bbmi/0.1.0.json) + [template-config.md](./template-config.md)
- Retentie / storage-lifecycle foto’s (met klant)
- TypeScript types / sync payloads (later apart document indien nodig)
