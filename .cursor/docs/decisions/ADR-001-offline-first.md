# ADR-001: Offline-first

**Status:** Akkoord  
**Datum:** 2026-08-10  
**Gerelateerd:** [offline-sync.md](../offline-sync.md), [architecture.md](../architecture.md)

---

## Context

Veldopnames gebeuren vaak zonder betrouwbaar internet (bouwplaats, kelder, landelijk). iOS/PWA biedt geen betrouwbare Background Sync. We moeten kunnen starten en afronden zonder netwerk, en later synchroniseren.

## Besluit

- **Offline-first vanaf fase 2:** primaire write-path is lokale opslag (IndexedDB / Dexie) → sync queue → API
- Fase 1 mag online-first zijn (engine + PWA zonder harde offline-garantie)
- Client genereert UUIDs; server accepteert die idempotent
- Sync bij app-open en terwijl online met app open
- Conflictregel initiële oplevering: veld-niveau LWW binnen eigenaarscope + history via observations

## Consequenties

- UI moet sync-status tonen (Concept / Pending / Synced / Error)
- Geen “direct-to-server” als enige schrijfpad
- Foto-compressie en upload-queue zijn onderdeel van fase 2
- Geavanceerde CRDTs / rijke conflict-UX = meerwerk

## Alternatieven (verworpen)

- Pure online-app — te fragiel voor veldwerk
- Native-only offline — conflicteert met PWA-productvoorstel voor fase 1–4
