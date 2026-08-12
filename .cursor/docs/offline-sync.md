# Offline sync

**Status:** productvoorstel / offertefase  
**Laatst bijgewerkt:** 2026-08-10  
**ADR:** [ADR-001-offline-first.md](./decisions/ADR-001-offline-first.md)

---

## Doel

Alle invoer eerst lokaal; synchronisatie daarna. Vanaf fase 2 is offline de primaire write-path. Nooit afhankelijk van internet om een opname te starten (na fase 2).

---

## Schrijfpad

```text
Gebruiker
  → Lokale opslag (IndexedDB / Dexie)
  → Sync Queue
  → API
  → Database (bron van waarheid)
```

Nooit direct als enige bron naar de server schrijven vanuit de UI.

---

## Sync-contract (richting)

- Elke entiteit: stabiele `id` (UUID), `updatedAt`, bij voorkeur ook `version` of `(updatedAt + deviceId)`
- **Veld-niveau last-write-wins** + history via observations (binnen eigenaarscope)
- Foto’s: immutable blobs
- iOS/PWA: geen betrouwbare Background Sync → sync bij openen app + wanneer online terwijl app open is
- UI-status per project: Concept / Pending sync / Gesynchroniseerd / Syncfout

Conflictregels in detail: [business-rules.md](./business-rules.md).

---

## Identifiers

- Client genereert UUIDs (bij voorkeur UUID v7 / ULID-achtig)
- Server accepteert client-ids bij create (idempotent sync)

---

## Foto’s

- Compressie aan de client-kant vóór opslag/sync
- Upload via queue (apart van metadata-sync indien nodig)
- Metadata in Postgres (`storageProvider` + `storageKey`); blobs in **R2** (MVP)
- Offline-queue is blob-store-agnostisch: later switch naar Supabase Storage = migratie + key-update, geen herschrijven van sync-logica

---

## Fase-afbakening

| Fase | Offline |
|---|---|
| Fase 1 | Online-first; nog geen harde offline-garantie |
| Fase 2 | IndexedDB/Dexie primaire write-path; queue; offline create/edit; foto-queue; sync-status UI |

---

## Open punten

- Exacte sync-payload shapes (later in [api-contracts.md](./api-contracts.md))
- Retry / backoff-beleid (richting: wel retry; details in fase 2)
- Partial failure: **toestaan** (metadata ok, foto faalt) + hernieuwde foto-upload
- Device-conflict UX bij LWW (fase 2)

## Photo upload

**Presigned R2** (MVP): Worker geeft tijdelijke upload-URL; client uploadt blob direct naar R2.  
Niet via Worker-proxy (body-limits, bandbreedte, trager bij veel foto’s).
