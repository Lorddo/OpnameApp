# ADR-006: Technical stack

**Status:** Akkoord  
**Datum:** 2026-08-10 (Auth-richting: IdP achter JWT; switchbaar)  
**Gerelateerd:** [architecture.md](../architecture.md), [offline-sync.md](../offline-sync.md), [ADR-007-pwa-first.md](./ADR-007-pwa-first.md)

---

## Context

We hebben een veldclient (offline-capable), een dunne API, relationele bron van waarheid, blob-opslag voor foto’s, en multi-tenant autorisatie nodig — zonder dag-1-overengineering.

## Besluit

| Laag | Keuze |
|---|---|
| Frontend | Vue 3 + TypeScript + PWA |
| Offline opslag | IndexedDB via Dexie |
| Backend / API | Cloudflare Workers |
| Database | PostgreSQL (Supabase) + RLS |
| Bestanden | **Cloudflare R2** (MVP) |
| Auth | **Supabase Auth** + JWT-validatie in Cloudflare Workers |
| Sync | Queue-based (lokaal eerst, daarna API) |

### Stack-regels

- Autorisatie in API + database (RLS), niet alleen in de client
- Attribute-catalogus en templates versioned/configureerbaar, niet hardcoded in screens
- Foto-metadata in Postgres bevat `storageProvider` + `storageKey` (geen harde vendor-URLs als bron van waarheid) — switch naar andere blob-store later mogelijk via migratie + key-mapping
- Auth: Supabase Auth is gekozen; Workers valideren JWT. Gebruikers/orgs in eigen tabellen. Latere IdP-wissel blijft redelijk als login-UI en token-issuer geïsoleerd blijven

### Blob-opslag & offline sync

Offline sync hangt **niet** aan R2 vs Supabase Storage. Wat telt:

1. Client-side compressie + lokale queue (Dexie)
2. Idempotente upload (client UUID)
3. **Presigned** upload naar R2 (blobs niet door Workers heen)
4. Metadata sync apart van blob-upload (partial failure toegestaan)

**R2** past het best bij Workers (zelfde edge, S3-compatibel, lage egress). Supabase Storage is later switchbaar als de klant dat wil; metadata blijft in Postgres.

## Consequenties

- Edge Workers houden de API dun; zware business logic blijft beperkt/expliciet
- Dexie/IndexedDB is verplicht voor fase-2 write-path
- R2 is MVP-keuze; provider-abstractie houdt switch naar Supabase Storage haalbaar (blob-copy + key-update)

## Alternatieven (verworpen)

- Pure native iOS als enige client — zie ADR-007
- Monolithische Node/Rails-app zonder edge — minder passend bij sync/PWA-richting
- Client-only autorisatie — onveilig bij multi-tenant
- Supabase Storage als dag-1 default — minder natuurlijk bij Workers; bewaren als latere optie
