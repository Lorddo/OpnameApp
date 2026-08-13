# Decisions (ADRs)

Architecture Decision Records voor het vastgoed-opnameplatform.

| ADR | Onderwerp | Status |
|---|---|---|
| [ADR-001-offline-first.md](./ADR-001-offline-first.md) | Offline-first + sync | Akkoord |
| [ADR-002-observations-model.md](./ADR-002-observations-model.md) | Observations / attributes / facts | Akkoord |
| [ADR-003-multi-tenant.md](./ADR-003-multi-tenant.md) | Multi-tenant, ownership, visibility | Akkoord |
| [ADR-004-config-driven-platform.md](./ADR-004-config-driven-platform.md) | Generiek platform + templates | Akkoord |
| [ADR-005-property-source-of-truth.md](./ADR-005-property-source-of-truth.md) | Property als bron van waarheid | Akkoord |
| [ADR-006-technical-stack.md](./ADR-006-technical-stack.md) | Tech stack | Akkoord |
| [ADR-007-pwa-first.md](./ADR-007-pwa-first.md) | PWA first | Akkoord |
| [ADR-008-api-boundary.md](./ADR-008-api-boundary.md) | API-grens; dashboard/rapporten buiten scope | Akkoord |
| [ADR-009-template-version-pinning.md](./ADR-009-template-version-pinning.md) | TemplateVersion pinnen | Akkoord |
| [ADR-010-photos-as-evidence.md](./ADR-010-photos-as-evidence.md) | Foto’s als bewijs op subjects | Akkoord |
| [ADR-011-phased-delivery.md](./ADR-011-phased-delivery.md) | Oplevering in 4 fasen | Akkoord |
| [ADR-012-monorepo-packages-core.md](./ADR-012-monorepo-packages-core.md) | Monorepo + packages/core | Akkoord |
| [ADR-013-i18n-nl-en.md](./ADR-013-i18n-nl-en.md) | i18n NL/EN vanaf fase 0 | Akkoord |
| [ADR-014-facts-as-view.md](./ADR-014-facts-as-view.md) | Facts als security_invoker view | Akkoord |
| [ADR-015-combined-inspection.md](./ADR-015-combined-inspection.md) | Gecombineerde opname + template-pins | Akkoord |
| [ADR-016-client-org-assignment.md](./ADR-016-client-org-assignment.md) | Opdrachtgever + toewijzing + API-keys | Akkoord |
| [ADR-017-multi-device-silent-lww.md](./ADR-017-multi-device-silent-lww.md) | Multi-device = aparte inspections; stil LWW | Akkoord |
| [ADR-018-photo-retention-local-purge.md](./ADR-018-photo-retention-local-purge.md) | Server 6m retentie; device blobs houden; lokaal wissen | Akkoord |

Bij nieuwe architectuurkeuzes: nieuw ADR-bestand toevoegen (`ADR-00N-…md`).

---

## Beslislog (samenvatting)

| Onderwerp | Besluit | Status |
|---|---|---|
| Platform vs losse apps | Generiek platform; templates voor inspectietypes | Akkoord |
| Vastgoedscope | Elk type vastgoed, niet alleen wonen | Akkoord |
| Bron van waarheid | Property (+ facts zichtbaar voor org); observations met tijd/bron/eigenaar | Akkoord |
| Data-eigenaarschap | Klant/opnemende partij juridisch eigenaar; leverancier geen data-eigenaar | Akkoord (klantfeedback) |
| Observations behouden | Observations blijven; niet verwijderen als model | Akkoord |
| Eigenaarschaplaag | `owner_org_id` + `visibility` op Observation (en Inspection/Photo) | Akkoord (klantfeedback) |
| Company-wissel | Geen automatische overname bestaande inspectiedata/observations | Akkoord (klantfeedback) |
| Fysiek vs. inspectie | Property-structuur centraal; inspectieresultaten eigenaar-gebonden | Akkoord |
| Gevels / pandbreed | Property-scope attributes, geen aparte entiteit (tenzij later nodig) | Akkoord |
| UX | Onderdelen doorlopen (lagen → ruimtes → checklist), geen “vragenlijst”-framing | Akkoord |
| Dossier | View/export over property-data, geen aparte waarheid | Akkoord |
| Attributes | Catalogus + template-selectie; key = `{answerScope}.{questionKey}` | Akkoord |
| Condities | `showWhen` scoped syntax (`room.this.*` nu; floor/property/cross-room later) | Akkoord |
| Verplichtheid | Zichtbaar én in gepinde template; verborgen antwoorden wissen | Akkoord |
| Foto’s | Aan subject/observation; compressie client-side; zelfde eigenaarschap | Akkoord |
| Offline | Fase 2: offline-first + queue sync | Akkoord |
| Template versioning | Pin `templateVersion` bij start opname | Akkoord |
| Multi-tenant / delen | `org_id` + ownership + visibility/share-hooks; UI delen later | Akkoord |
| Conflictregel | LWW op veld binnen eigenaarscope + history | Akkoord |
| Stack | Vue3/TS/PWA, Dexie, Workers, Supabase PG, **R2**, JWT | Akkoord |
| Blob-opslag | R2 (MVP); metadata `storageProvider`+`storageKey` → later switchbaar | Akkoord |
| Auth | Eigen **Supabase Auth** + JWT-validatie in Cloudflare Workers | Akkoord |
| PWA | PWA first; geen App Store-eis | Akkoord |
| Export | JSON dossier-export MVP; andere formaten (CSV, ZIP+foto’s) later toevoegbaar | Akkoord |
| Fact-delen | MVP: geen org-tot-org fact-sharing; dashboard leest via API/export | Akkoord |
| Fact-consolidatie | LWW per veld binnen `owner_org_id`; history via observations | Akkoord |
| BAG | Lookup/dedupe **niet** in onze app (dashboard); optioneel BAG-id opslaan indien aangeleverd | Akkoord |
| Photo upload | Presigned R2 (niet proxy via Workers) | Akkoord |
| Sync partial failure | Toestaan (meta ok / foto faalt) + retry/backoff; UX-detail in fase 2 | Richting |
| Hosting | Free tiers voor dev/staging; eerste 2–3 mnd door ons; daarna klant bij opschaling | Akkoord |
| Rollen | Opnemer + admin/reviewer als richting; exacte rechten tijdens dev | Later |
| Dashboard | Buiten scope; wij leveren API | Akkoord |
| Rapporten | Buiten scope; klant-dashboard | Akkoord |
| Oplevering | 4 fasen: Engine+PWA → Offline+Sync → BBMI → WWS | Akkoord |
| Monorepo | pnpm workspaces; engine in `packages/core` gedeeld door PWA+API | Akkoord |
| i18n | NL + EN via vue-i18n vanaf fase 0 | Akkoord |
| Hosting PWA | Workers static assets; `/api/*` via service binding (same-origin) | Akkoord |
| Facts | View met `security_invoker`; LWW binnen `owner_org_id` | Akkoord |
| Gecombineerde opname | Meerdere `inspection_template_pins` per inspection | Akkoord |
| Opdrachtgever | `org_type` client/inspection/platform + `property_assignments` | Akkoord |
| Dashboard-access | API-keys (gehasht, org-scoped) naast JWT | Akkoord |
| Multi-device | Aparte inspections per inspecteur op zelfde property; geen shared inspection | Akkoord |
| LWW conflict-UX | Stil overschrijven in MVP; history blijft; geen melding | Akkoord |
| Foto-retentie (server) | 6 maanden na sync default (3 mnd ok); product-lifecycle = dashboard | Akkoord |
| Foto’s op device | Na sync blobs behouden; project-verwijderen wist géén foto’s | Akkoord |
| EPA/NEN2580/WO/BOG/brand | Meerwerk | Akkoord |
| Scan/LiDAR-app | Later frontend; niet op wachten | Akkoord |
| Partner CSV/templates | Apart project; out of scope hier | Akkoord |
| Realworks | Geen API-koppeling; later eventueel import van exports | Richting |

### Nog uit te werken

- Exacte rollen-rechten tijdens dev
- Concrete attribute-sets voor BBMI (fase 3) en WWS (fase 4) — BBMI: [`templates/bbmi/0.1.0.json`](../../templates/bbmi/0.1.0.json) + [template-config.md](../template-config.md)
- API-contract OpenAPI + dossier-payload shape — JSON-export akkoord; zie [api-contracts.md](../api-contracts.md)
- Sync UX-details (retry/backoff) in fase 2 — conflict-melding: stil LWW (ADR-017)
- ~~Retentie / storage-lifecycle foto’s (met klant)~~ — **besloten:** ADR-018
- Contractuele formulering verwerker vs. opdrachtgever wanneer DPA / hosting-overdracht speelt

### Partijen (communicatie)

| Rol | Wie |
|---|---|
| Softwareontwikkelaar / verwerker (platform) | Wij |
| Opdrachtgever platform | Pranimate (tekenbureau) |
| Eindgebruikers / opnemende partijen | Inspecteurs, makelaars, corporaties, fotografen (klanten van Pranimate) |
| Vastgoedeigenaren | Bedrijfspand-/woningeigenaren (objectcontext; niet per se app-user) |
