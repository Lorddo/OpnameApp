# API contracts

**Status:** richting — contract nog niet vastgelegd  
**Laatst bijgewerkt:** 2026-08-10

Dit document beschrijft de **bekende richting** en open punten. Concrete OpenAPI/endpoints volgen tijdens implementatie (fase 1).

---

## Rol van de API

- Technische bron van waarheid voor het platform (samen met Postgres)
- Enige schrijfpad vanaf clients na de lokale sync queue ([offline-sync.md](./offline-sync.md))
- Koppelvlak voor klantdashboard, latere iOS/LiDAR-frontend, management portal

Externe systemen koppelen **op onze API** — niet andersom als primaire integratie.

---

## Clients

| Client | Verwacht gebruik |
|---|---|
| Inspectie PWA | Auth, templates, properties/inspections CRUD, observations, foto-upload, sync |
| Klantdashboard | Read/export: property-dossier, facts/observations binnen visibility, compleetheid t.o.v. template |
| iOS LiDAR-scan (later) | Zelfde domain resources; eventueel meetdata als observations/attachments |
| Management portal | Orgs, users, templates/attribute-catalogus |

---

## Auth & tenancy

- Token/JWT (bijv. Supabase Auth), gevalideerd in Cloudflare Workers
- Autorisatie in API **én** database (RLS) — niet alleen client
- Requests zijn org-scoped; `owner_org_id` / visibility afdwingen server-side

---

## Resource-richting (conceptueel)

Nog geen vaste paths; verwachte resource-families:

| Familie | Doel |
|---|---|
| `/auth` / session | Login, token refresh |
| `/organizations`, `/users` | Tenant/org-context |
| `/properties` | Objectidentiteit, floors, rooms, assets |
| `/inspections` | Opname-instanties + gepinde templateVersion |
| `/observations` | Claims create/update (idempotent op client UUID) |
| `/facts` | Geconsolideerde waarden (read; scoped) |
| `/photos` | Metadata + upload URL / multipart |
| `/templates`, `/attributes` | Catalogus + template configs (versioned) |
| `/sync` | Batch pull/push queue payloads (fase 2) |
| `/exports` / dossier | View-payload voor dashboard / meeneembaarheid |

Exacte shapes: TBD. Domeinvelden volgen [data-model.md](./data-model.md) en [diagrams/er-detailed.md](./diagrams/er-detailed.md).

---

## Sync-contract (API-kant)

- Client-gegenereerde UUIDs accepteren bij create (idempotent)
- Entiteiten: `id`, `updatedAt`, bij voorkeur `version` of `(updatedAt + deviceId)`
- Conflict: veld-LWW binnen eigenaarscope; history via observations
- Foto’s: immutable blobs; metadata apart

Details: [offline-sync.md](./offline-sync.md).

---

## Scope t.o.v. klant

| Wij leveren | Klant bouwt |
|---|---|
| API + auth + export/dossier-payloads | Dashboard UI |
| Gestructureerde opnamedata | Rapportgeneratie (BBMI/WWS/…) |

---

## Export

- **MVP:** JSON dossier-export (akkoord)
- Extra formaten (CSV, ZIP met foto’s) later toevoegbaar — export is een view, geen bron van waarheid

## Open contractpunten (implementatie)

- [ ] Concrete endpoints, request/response schemas (OpenAPI)
- [ ] Auth scopes / roles mapping (rollen-detail tijdens dev)
- [ ] Dossier-payload shape voor klantdashboard (JSON)
- [ ] Sync batch protocol (push/pull, cursors, error codes)
- [ ] Photo upload: **presigned R2** (niet proxy); metadata `storageProvider` + `storageKey`
- [ ] Webhooks / events (niet nodig voor MVP)

---

## Zie ook

- [architecture.md](./architecture.md)
- [workflows.md](./workflows.md)
- [business-rules.md](./business-rules.md)
