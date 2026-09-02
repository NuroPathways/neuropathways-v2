# NeuroPath

A privacy-first behavioral health platform for clinicians, parents, and clients. All patient data lives on Replit's own Postgres — no third-party hosted servers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080 via `$PORT`)
- `pnpm --filter @workspace/neuropath run dev` — run the React frontend (Vite, port via `$PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-set by Replit)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (react-router-dom v6, Tailwind CSS v3 via PostCSS)
- API: Express 5, port bound to `$PORT`
- DB: PostgreSQL + Drizzle ORM
- Auth: Replit Auth (OIDC/PKCE) — sessions stored in Postgres `sessions` table
- AI: Anthropic Claude via `@anthropic-ai/sdk`
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (ESM bundle); `zod` is externalized in `build.mjs`

## Where things live

- `artifacts/neuropath/src/` — React frontend (migrated from Base44)
- `artifacts/neuropath/src/api/entities.js` — Base44 API compatibility shim; all entity CRUD calls route here
- `artifacts/api-server/src/routes/entities.ts` — REST CRUD routes for all 14 entity tables
- `artifacts/api-server/src/routes/auth.ts` — Replit Auth (OIDC) login/callback/logout routes
- `artifacts/api-server/src/routes/ai.ts` — Anthropic AI chat route
- `lib/db/src/schema/entities.ts` — Drizzle schema for all 14 app tables
- `lib/db/src/schema/auth.ts` — Drizzle schema for users + sessions tables

## Architecture decisions

- **Privacy-first**: All patient data on Replit Postgres. No Base44, no third-party data hosting.
- **Base44 shim**: `entities.js` exposes a `base44` object with the same `.entities.*` / `.auth.*` interface the original code expected, re-implemented as `fetch()` calls to the local API server. This avoids rewriting every page.
- **Replit Auth only**: Web-only OIDC login. Mobile auth endpoints from the template were removed since this is a web app.
- **Tailwind v3 via PostCSS**: The vite.config uses `css.postcss.plugins` (not `@tailwindcss/vite`) because the migration source used Tailwind v3.
- **`zod` externalized**: Added `"zod"` to the `external` array in `artifacts/api-server/build.mjs` so esbuild doesn't try to bundle it from `@workspace/api-zod`.

## Product

Three user roles on one platform:
- **Clinicians**: manage families, children, behavior plans, documents, and intervention plans
- **Parents**: view child progress, log wins, use AI chat for between-session support
- **Clients**: access their own treatment summaries and check-in tools

Client/parent login uses a separate username + access code flow (`/api/client-session/login`) alongside the standard Replit Auth clinician login.

## User preferences

- Privacy-first: all patient data stays on Replit Postgres, no third-party data sharing

## Gotchas

- After any schema change in `lib/db/src/schema/`, run `pnpm --filter @workspace/db run push` to apply to Postgres.
- If the api-server fails to build with `Cannot resolve "zod"`, check that `"zod"` is in the `external` array in `artifacts/api-server/build.mjs`.
- The frontend uses `BrowserRouter` (react-router-dom v6), not wouter. Navigation uses `useNavigate` and `Link`.
- Client session login (non-Replit-Auth path) lives in `artifacts/neuropath/src/lib/clientSession.js`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `replit-auth` skill for adding auth to new routes
