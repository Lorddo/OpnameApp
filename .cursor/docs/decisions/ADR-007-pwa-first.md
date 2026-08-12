# ADR-007: PWA first

**Status:** Akkoord  
**Datum:** 2026-08-10 (bevestigd 2026-08-12)  
**Gerelateerd:** [architecture.md](../architecture.md), [ADR-001-offline-first.md](./ADR-001-offline-first.md), [ADR-006-technical-stack.md](./ADR-006-technical-stack.md)

---

## Context

Veldgebruikers werken op iOS, Android, tablets (iPad) en desktop. Een native App Store-app verhoogt kosten, release-cycli en wachttijd. Offline blijft wel een harde eis (fase 2).

## Besluit

- **PWA** is de gekozen client voor fase 1–4 (installeerbaar op startsysteem, geen App Store-publicatie vereist)
- Native App Store-app is **geen** harde opleveringseis
- iOS LiDAR / scan-app = latere frontend op dezelfde API; we wachten daar niet op
- Native wrapper / App Store alleen bij aantoonbare PWA-pijn (meerwerk)

## Consequenties

- Offline via IndexedDB/Dexie + foreground sync (geen betrouwbare Background Sync op iOS)
- Eén codebase voor iOS/Android/desktop browsers
- Scan/LiDAR-integratie later via WebView of native client op dezelfde API

## Alternatieven (verworpen)

- Native-only iOS vanaf dag 1 — te smal, te duur voor MVP-scope
- Wachten op LiDAR-app vóór platform — blokkeert oplevering
