# Offline sync

**Status:** fase 2 in uitvoering  
**Laatst bijgewerkt:** 2026-08-13  
**ADR:** [ADR-001-offline-first.md](./decisions/ADR-001-offline-first.md)

---

## Pull-sync

`GET /api/sync/pull` met cursors op `published_at` (templates) en `updated_at` (properties/inspections).

Client (`apps/pwa/src/db/pull.ts`):

1. Push outbox eerst (`flushOutbox`)
2. Pull page(s) tot `truncated` false
3. Schrijf naar Dexie; **overschrijf geen** lokale rijen met `syncStatus` pending/error/draft
4. Bewaar cursors in `syncMeta`

`syncNow` in de sync-store doet push + pull + projectenlijst-refresh.

## Conflict / multi-device

Zie [ADR-017](./decisions/ADR-017-multi-device-silent-lww.md):

- Geen shared inspection; meerdere inspecteurs → aparte inspections op dezelfde property
- LWW UX: stil; history blijft in observations

---

## Offline app shell

- In **`pnpm dev`** werkt vliegtuigmodus **niet** voor de shell: Vite laadt modules live vanaf het netwerk.
- Offline testen: `pnpm --filter @opnameapp/pwa preview:offline`, app één keer online openen (SW precache), daarna DevTools → Offline.
- Auth-init blokkeert de UI niet meer; sessie komt uit lokale storage met timeout-fallback.
- Fonts zijn self-hosted (`@fontsource/source-sans-3`), geen Google Fonts-CDN.
- Productie/preview: Workbox cacheert shell + fonts; navigatie NetworkFirst met fallback.
- App-update: `registerType: 'prompt'` + `ReloadPrompt` (herladen bij nieuwe SW); periodieke update-check elk uur.

---

## Doel

Alle invoer eerst lokaal; synchronisatie daarna. Vanaf fase 2 is offline de primaire write-path. Nooit afhankelijk van internet om een opname te starten (na fase 2).

---

## Schrijfpad

```text
Gebruiker
  → Lokale opslag (IndexedDB / Dexie)
    → Sync Queue (outbox)
      → API
        → Database (bron van waarheid)
```

Implementatie (PWA):

- Dexie DB `opnameapp` in `apps/pwa/src/db/`
- Repository-writes in `apps/pwa/src/db/repository.ts`
- Outbox + flush in `apps/pwa/src/db/outbox.ts` / `sync.ts`
- Stabiele `device_id` in `localStorage` (`opnameapp.device_id`)
- Client-IDs: UUID v7 via `apps/pwa/src/db/ids.ts`

---

## Outbox

Elke write enqueued een item:

| Op | Push |
|---|---|
| `property.upsert` | `POST /api/properties` |
| `floor.upsert` / `floor.delete` | floors API |
| `room.upsert` / `room.delete` | rooms API |
| `inspection.upsert` / `inspection.patch` | inspections API |
| `observations.batch` | `POST /api/observations/batch` |
| `photo.meta` | `POST /api/photos/upload-url` |
| `photo.content` | `PUT /api/photos/:id/content` (lokaal blob) |

Regels:

- Flush bij app-start, bij `window.online`, en na elke write (best-effort)
- Retry met exponentiële backoff (1s → max 5 min)
- `photo.content` hangt aan `dependsOn: [photo.meta outbox id]`
- Partial failure toegestaan: metadata kan synchen terwijl blob nog in `photoBlobs` staat

---

## Identifiers

- Client genereert UUID v7
- Server accepteert client-ids bij create (idempotent sync)
- `device_id` op observations voor conflict/debug-metadata

---

## Sync-status (lokaal)

Per entiteit: `draft` | `pending` | `synced` | `error`  
UI: globale sync-balk + per-project Concept / Pending / Synced / Error; actie “Nu synchroniseren”.

---

## Foto’s

- Client-side prep vóór Dexie (`apps/pwa/src/db/photo-prepare.ts`): max lange zijde **1920px**, JPEG quality **0.72**, SHA-256 checksum
- Gecomprimeerde blob in Dexie `photoBlobs`; checksum in foto-meta + `photo.meta` outbox-payload
- Partial failure: meta kan synchen terwijl `photo.content` nog in de queue staat
- Na succesvolle upload: **lokale blob blijft** (ADR-018); ruimte vrijmaken via “van apparaat wissen”
- Worker-mediated PUT blijft voor nu (same-origin); echte presigned R2 kan later zonder outbox-op te wijzigen
- Fine-tuning resolutie/kwaliteit met veldfeedback

---

## Lokale purge

`purgePropertyLocal(propertyId)` wist property + floors/rooms/inspections/observations + gerelateerde (niet-foto) outbox-rijen **alleen op dit apparaat**. **Foto’s/`photoBlobs` blijven.** Server/R2 blijft. Zie ADR-018.

---

## Fase-afbakening

| Fase | Offline |
|---|---|
| Fase 1 | Online-first; nog geen harde offline-garantie |
| Fase 2 | IndexedDB/Dexie primaire write-path; queue; offline create/edit; foto-queue; sync-status UI |

---

## Open punten (overleg)

- Fine-tune max foto-resolutie / compressieniveau (start: 1920px / JPEG 0.72)
- Server cleanup-job (6 maanden na sync) — later hardening

## E2E

```bash
pnpm --filter @opnameapp/pwa test:e2e
```

Smoke: SW precache → offline reload van login-shell; outbox-rij blijft na offline herstart in IndexedDB.
