# ADR-012: Monorepo + packages/core

**Status:** Akkoord  
**Datum:** 2026-08-12  
**Gerelateerd:** [architecture.md](../architecture.md), [ADR-006](./ADR-006-technical-stack.md), [ADR-004](./ADR-004-config-driven-platform.md)

---

## Context

PWA en API moeten dezelfde template-validatie, `showWhen`-evaluatie en compleetheidsberekening gebruiken. Duplicatie leidt tot offline/online drift.

## Besluit

pnpm-workspace monorepo:

| Pad | Rol |
|---|---|
| `apps/pwa` | Vue 3 + Vite + PWA |
| `apps/api` | Hono op Cloudflare Workers |
| `packages/core` | Domeintypes, Zod template-schema, later showWhen/completeness/merge |

- Template-engine wordt **één keer** in `packages/core` geschreven en door PWA én API geïmporteerd.
- `pnpm validate:templates` draait tegen `templates/**/*.json` via core.
- Same-origin hosting: PWA-worker serveert assets en stuurt `/api/*` via service binding naar de API-worker.

## Consequenties

- Workspace-scripts (`test`, `typecheck`, `build`) zijn root-gestuurd.
- Deploy blijft gescheiden (twee Workers), maar productie-URL is één hostname zonder CORS.
- Domainlogica hoort niet in Vue-views of Worker-routes; die importeren core.

## Alternatieven (verworpen)

- Losse repo’s met gedeelde npm-package — te zwaar voor dit team/fase.
- Engine alleen in de PWA — API kan ingezonden opnames niet betrouwbaar valideren.
- Engine alleen in de API — offline PWA kan niet dezelfde regels toepassen.
