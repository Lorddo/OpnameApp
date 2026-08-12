# Architecture

**Status:** productvoorstel / offertefase  
**Laatst bijgewerkt:** 2026-08-12

---

## Architectuurprincipes

| Principe | Betekenis |
|---|---|
| Offline First | Alle invoer eerst lokaal; sync daarna (fase 2) |
| API First | Backend is bron van waarheid; frontends zijn clients |
| Configuratie Gedreven | Inspectietypes = templates over attributes (`answerScope` + `showWhen`) |
| Multi Tenant Ready | `org_id` + scheiding vanaf dag 1 |
| Ownership First | Observations/inspecties/foto’s hebben een eigenaar; geen stille overname |
| Share Ready | Objecten deelbaar tussen organisaties; inspectiedata alleen via expliciete visibility/share |
| Data Portability | Klant kan exporteren en data meenemen; leverancier is geen data-eigenaar |
| Multi-frontend Ready | PWA nu; later o.a. LiDAR/iOS-app op dezelfde API |
| SaaS Ready | Meerdere opdrachtgevers op één platform |
| Schaalbaar zonder herbouw | Structuur klaar voor groei; geen over-engineering op dag 1 |

Details: [offline-sync.md](./offline-sync.md), [ADR-001-offline-first.md](./decisions/ADR-001-offline-first.md), [ADR-003-multi-tenant.md](./decisions/ADR-003-multi-tenant.md).

---

## Backend, API en integraties

### Eigen backend

Doel:

- Centrale objectdatabase (met eigenaarschap en visibility)
- Centrale opslag en synchronisatie
- Onafhankelijk van klantsoftware
- Export / portabiliteit zodat de klant data-eigenaar blijft

Wij zijn de **technische bron van waarheid van het platform** (API/database). Juridisch blijft de klant/opnemende partij eigenaar van bronbestanden en opnamedata. Externe systemen koppelen **op onze API**.

### Wat wij leveren vs. klant

| Onderdeel | Scope |
|---|---|
| Backend + API | **In scope** (onze oplevering) |
| Inspectie-PWA | **In scope** |
| Klantdashboard (bouw/beheer/UI) | **Buiten scope** — zij sluiten hun dashboard aan op onze API |
| Rapportgeneratie (BBMI/WWS/EPA-rapporten) | **Buiten scope** — gebeurt in hun dashboard/tools op basis van onze data |
| iOS LiDAR / scan-app | **Buiten scope nu** — later als extra frontend op dezelfde API; we wachten hier niet op |
| Partner-template vullen / CSV-export project | **Buiten scope** (apart traject) |
| Realworks API-koppeling | **Niet voorzien** (duur/onnodig); eventueel later **import van exports** als meerwerk |

### API-first / meerdere frontends

| Client | Rol | Timing |
|---|---|---|
| Inspectie PWA | Veldopnames | Fasen 1–4 |
| Klantdashboard | Consumeren API, dossiers/rapporten | Klant; wij leveren API-contract |
| iOS LiDAR-scan app | Meetdata / embedded of native UI | Later meerwerk |
| Management portal | Orgs, users, templates | Naar behoefte |

Integratiepad scan-app later (niet blokkerend):

1. Embedded WebView naar PWA (snel, lagere UX), of  
2. Native frontend op dezelfde API  

Contractrichting: [api-contracts.md](./api-contracts.md).

### Schaalbaarheid (richting)

Voorbereid op ordegrootte o.a. tienduizenden objecten/jaar, honderden gebruikers, veel foto’s, meerdere opdrachtgevers.  
Focus: schaalbare structuur zonder dag-1-overkill.

---

## Technische stack (akkoord)

| Laag | Keuze | Toelichting |
|---|---|---|
| Frontend | Vue 3 + TypeScript + PWA | Cross-platform veldapp (productvoorstel i.p.v. pure native iOS) |
| Offline opslag | IndexedDB via Dexie | Observations, queue, foto’s/meta |
| Backend / API | Cloudflare Workers | Dunne edge API, sync endpoints |
| Database | PostgreSQL (Supabase) | Bron van waarheid; RLS voor tenancy |
| Bestanden | Cloudflare R2 (MVP) | Blobs; metadata in Postgres (`storageProvider` + `storageKey`) |
| Auth | **Supabase Auth** + JWT-validatie in Cloudflare Workers | Eigen login; Workers valideren token |
| Sync | Queue-based | Lokaal eerst, daarna API |

### Stack-regels

- Autorisatie afdwingen in API + database (RLS), niet alleen in de client
- Attribute-catalogus en templates versioned/configureerbaar, niet hardcoded in screens
- PWA is akkoord; native App Store-app is geen harde eis voor fase 1–4
- Blob-store is abstracterbaar: R2 nu; switch naar Supabase Storage later via key-migratie (offline-sync hangt hier niet van af)
- Hosting: free tiers voor dev/staging; eerste 2–3 maanden door ons; daarna klant bij opschaling

---

## Oplevering in 4 fasen

Doel: werkend platformpatroon + BBMI + WWS. Geen “alles tegelijk”.

### Fase 1 — Engine + PWA

- Domeinmodel (Property, Floors, Rooms, Assets, Attributes, Observations met owner/visibility, Facts, Photos)
- Auth + org (`org_id`, `owner_org_id`, RLS-basis)
- Attribute-catalogus + template-engine (config-gedreven)
- PWA UI: opnameflow als **onderdelen doorlopen** (online-first)
- API waarmee data kan worden opgehaald (voor aansluiting klantdashboard)
- Nog geen harde offline-garantie

### Fase 2 — Offline + Sync

- IndexedDB / Dexie als primaire write-path
- Sync queue + conflictregel (LWW + history)
- Offline projecten aanmaken/bewerken
- Foto compressie + upload-queue (**presigned R2**; partial failure toegestaan)
- Sync-status in UI
- Geen BAG-lookup in de PWA (objectidentiteit via adres/UUID; BAG elders in dashboard)

### Fase 3 — BBMI-template

- BBMI als eerste volledige template-config ([template-config.md](./template-config.md))
- Veldflow: lagen → roomTypes → room-checklist; verplicht = zichtbaar + in template
- Verplichte attributes / foto’s / onderdelen voor BBMI
- Compleetheidsbeeld (dossier-view t.o.v. BBMI-template)
- Afstemming attribute-set met klant ([`templates/bbmi/0.1.0.json`](../templates/bbmi/0.1.0.json))

### Fase 4 — WWS-template

- WWS als tweede template over dezelfde Property-data
- Hergebruik overlapping attributes met BBMI
- Compleetheidsbeeld t.o.v. WWS-template

### Meerwerk (niet in fase 1–4)

- EPA, NEN 2580, WO, BOG-templates, brandveiligheid, …
- Uitgewerkte cross-org share UI
- LiDAR / native iOS-frontend
- Realworks-export import
- Partner-template / CSV-vulling (apart project)
- Dashboard-bouw of rapportgenerators
- App Store native wrapper (alleen bij aantoonbare PWA-pijn)
- Geavanceerde conflictoplossing / CRDTs
- Rijke review/approval-flow

---

## Zie ook

- [vision.md](./vision.md) — doel en scope
- [data-model.md](./data-model.md) — domein
- [offline-sync.md](./offline-sync.md) — sync-architectuur
- [decisions/](./decisions/) — ADRs
