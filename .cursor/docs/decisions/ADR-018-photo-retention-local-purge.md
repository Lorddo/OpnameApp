# ADR-018: Foto-retentie + lokale opslagruimte

**Status:** Akkoord  
**Datum:** 2026-08-13  
**Gerelateerd:** [ADR-010-photos-as-evidence.md](./ADR-010-photos-as-evidence.md), [offline-sync.md](../offline-sync.md)

---

## Context

Foto’s vullen R2/Postgres én IndexedDB. Product-lifecycle (wie mag soft-deleten in het dossier) zit bij het Pranimate-dashboard. Op het device willen inspecteurs foto’s soms nog voor andere doeleinden gebruiken; tegelijk mag IndexedDB niet onbegrensd groeien.

## Besluit

1. **Product-lifecycle foto’s** (zichtbaarheid, verwijderen in dossier): **dashboard / klantzijde** — buiten scope van de opname-PWA.
2. **Onze serveropslag (Postgres-meta + R2):** bewaar blobs/meta **6 maanden na succesvolle sync** als default; 3 maanden is acceptabel als opslag krap is. Cleanup = later job/cron, geen MVP-blocker.
3. **Device (IndexedDB):** na succesvolle upload **lokale foto-blobs niet automatisch wissen**. Gebruiker kan ze zelf nog nodig hebben.
4. **Lokale ruimte vrijmaken:** gebruiker kan een project **verwijderen** (lokale property + inspections/observations/floors/rooms + gerelateerde outbox). Dit wist **geen** `photos` / `photoBlobs` — foto’s blijven op het apparaat. Server/R2 blijft onaangetast. Na pull kan het project weer als remote listing verschijnen.

## Consequenties

- Sync mag `photoBlobs` niet meer legen na `photo.content`
- PWA heeft een expliciete “Verwijderen”-actie (lokaal project) met bevestiging (extra waarschuwing bij pending sync); foto’s blijven lokaal
- Server-side retentiejob is fase 5 / ops hardening, niet fase 2

## Alternatieven (verworpen)

- Blobs direct na sync van device wissen — conflicteert met hergebruik door de opnemer
- Automatische IndexedDB-GC zonder user-actie — onvoorspelbaar in het veld
- Server-lifecycle volledig overlaten zonder limiet op onze R2 — risico op onbegrensde storage bij ons
