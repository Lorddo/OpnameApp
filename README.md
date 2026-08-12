# OpnameApp

Vastgoed Opname Platform — monorepo (PWA + Cloudflare Workers API + Supabase + R2).

## Structuur

```text
apps/
  pwa/       Vue 3 + Vite + PWA (NL/EN)
  api/       Hono op Cloudflare Workers
packages/
  core/      Domeintypes, template Zod-schema, later showWhen/completeness
templates/   Gepinde inspectietemplates (JSON)
supabase/    Declaratief schema + migraties
```

## Lokaal starten

```bash
pnpm install
pnpm --filter @opnameapp/api dev   # http://127.0.0.1:8787
pnpm --filter @opnameapp/pwa dev   # http://127.0.0.1:5173 (proxyt /api)
```

Of parallel: `pnpm dev`.

Kopieer `.env.example` → `.env` en `apps/api/.dev.vars.example` → `apps/api/.dev.vars`.

## Scripts

| Script | Doel |
|---|---|
| `pnpm test` | Vitest (workspace) |
| `pnpm typecheck` | TypeScript |
| `pnpm lint` | ESLint |
| `pnpm build` | Build core + api + pwa |
| `pnpm validate:templates` | Valideer `templates/**/*.json` |

## Docs

Zie [`.cursor/docs/`](.cursor/docs/).
