# Asset Registry

A minimal, pump-aware asset registry. Browse, search, edit plant assets; attach documents; view change history; export to CSV.

## Stack

- SvelteKit (Node ≥ 20) + Svelte 5 runes
- TypeScript throughout
- Tailwind CSS v4 (`@import 'tailwindcss'` in `src/routes/layout.css`)
- shadcn-svelte primitives under `src/lib/components/ui/`
- Lucide icons via `@lucide/svelte`
- Drizzle ORM (typed queries) + postgres.js driver
- Tiptap for the rich-text description field
- `@sveltejs/adapter-node` for production (`build/index.js`)
- Deploy target: Scalingo (`DATABASE_URL=$SCALINGO_POSTGRESQL_URL`)

**No auth.** The v1 app is single-tenant and unauthenticated. See "What's NOT in v1" below.

## Setup

Requires Node 20+ and a running local Postgres. Local dev uses a Docker container (pgvector image so we can extend later without re-provisioning):

```sh
docker run -d \
  --name postgres-pgvector \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

Then:

```sh
# 1. Install deps
npm install

# 2. Create the local database (one-off)
PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "CREATE DATABASE asset_dev"

# 3. Configure env (already committed as .env, tweak if needed)
cp .env.example .env

# 4. Apply schema + seed
npm run db:migrate
npm run db:seed

# 5. Start dev server
npm run dev
```

Open http://localhost:5173.

## Environment variables

| Name                      | Required | Default            | Notes                                                                |
| ------------------------- | -------- | ------------------ | -------------------------------------------------------------------- |
| `DATABASE_URL`            | yes\*    | —                  | Postgres connection string. `*` fallback: `SCALINGO_POSTGRESQL_URL`. |
| `SCALINGO_POSTGRESQL_URL` | no       | —                  | Automatic on Scalingo; used when `DATABASE_URL` is absent.           |
| `UPLOAD_DIR`              | no       | `./uploads`        | Local filesystem path for uploaded documents.                        |
| `BODY_SIZE_LIMIT`         | no       | `52428800` (50 MB) | adapter-node body-parser cap. Must be ≥ 50 MB for uploads.           |
| `PORT`                    | no       | `3000`             | adapter-node HTTP port in production.                                |
| `DOCS_APP_BASE`           | no       | `http://localhost:5173` | Document-store SPA base URL — finding descriptions are edited there. |

## Database

- Migrations are **plain SQL** under `migrations/` — we do not use `drizzle-kit`. Drizzle ORM is used only for typed queries at runtime; its schema in `src/lib/server/db/schema.ts` is a manual mirror of the SQL.
- `updated_at` and the `asset_history` audit log are both maintained by Postgres triggers defined in `migrations/001_init.sql`. The API writes `changed_by` into a transaction-local GUC (`app.changed_by`) which the trigger reads.

npm scripts:

- `npm run db:migrate` — apply `migrations/001_init.sql`
- `npm run db:seed` — load `seed.sql` (truncates the three tables first)
- `npm run db:reset` — drop + recreate the dev DB and re-run both

## Features

- `/` — customer portal landing page with KPI tiles (total assets, assessed count, critical findings, recommended CapEx) and top critical findings.
- `/assets` — sortable table with class/criticality/lifecycle/**condition** filters, text search on tag/name/manufacturer, capped at 500 rows.
- `/assets/new` — create form. Pump attribute fields appear when `class_code` starts with `PUMP-`.
- `/assets/[id]` — view/edit, **Lummus DD tab** (condition rating, RUL, findings, recommendations), Tiptap description, documents tab, history tab (last 50 changes).
- `/tree` — recursive parent-child hierarchy, click to open.
- `/graph` — interactive Cytoscape graph, pan/zoom, three layouts, hover-neighbourhood highlight, **Colour by class or condition**.
- `/connectors` — admin registry of HTTP integrations to other ArborSpace apps and document stores. Paired with a "Link from connector" form on each asset's Documents tab.
- Document upload: PDF / PNG / JPG / DOCX, max 50 MB, stored under `UPLOAD_DIR/<asset_id>/<uuid>-<name>`. MIME is sniffed from magic bytes, not trusted from the client.
- CSV export: `/api/assets/export.csv`. Fixed columns + every key found in `attributes` across all rows.

## Server routes

- `GET /api/assets` — list (supports `search`, `class_code`, `criticality`, `lifecycle_state`, `sort`, `dir`)
- `POST /api/assets`
- `GET | PATCH | DELETE /api/assets/[id]` — delete is **restricted** if the asset has children (409).
- `GET /api/assets/[id]/history` — last 50 rows
- `GET /api/assets/[id]/documents`
- `POST /api/assets/[id]/documents` — multipart upload (`file`, optional `description`)
- `GET /api/assets/[id]/documents/[docId]` — download
- `GET /api/assets/export.csv`

## Production build

```sh
npm run build
npm run start          # node build/index.js with BODY_SIZE_LIMIT pre-set
```

On Scalingo the Postgres addon exposes `SCALINGO_POSTGRESQL_URL`; set `DATABASE_URL=$SCALINGO_POSTGRESQL_URL` in the buildpack env so the app picks it up.

**Note on file uploads on Scalingo:** the filesystem under `./uploads/` is ephemeral — files disappear on restart/redeploy. For real use, point `UPLOAD_DIR` at a mounted volume or swap the storage layer to object storage. Out of scope for v1.

## What's NOT in v2.2

Future-me: if any of this sounds tempting, it's v2.3+.

- No auth, no roles, no multi-user — not even `ADMIN_USERNAME`/`ADMIN_PASSWORD`. Single-tenant pitch demo only.
- No work orders, no inventory, no maintenance scheduling.
- No semantic search, no embeddings, no RAG on findings.
- No typed graph relationships yet (spec at [`docs/v2-spec.md`](docs/v2-spec.md)). Hierarchy is only parent-child via `parent_id`.
- No in-app authoring UI for DD assessments — read-only for now. Assessments are seeded.
- No PDF export of the DD report.
- No bulk edit, no import from external systems.
- No notifications or emails when a critical finding is recorded.
- No mobile-specific UI (responsive works, native apps don't exist).
- No document delete — upload only.
- No customer branding layer yet (Lummus wordmark, palette).
- Connectors: only `none` auth. No browse picker (URLs are pasted by hand). No file import — links only.

## Data model

See [`docs/data-model.md`](./docs/data-model.md) for the schema summary and notes on the class-code taxonomy (ISO 14224 / CFIHOS).

## Write path

All runtime writes to the `asset` table go through the write service (`src/lib/server/asset-service.ts` — `createAsset`/`updateAsset`: validation, ref integrity, audit actor, and the future rule-enforcement hook). Seeds are the named exception: they insert via raw psql with no validation, no rules, and no audit GUC — acceptable for fixtures only.

## Findings (merged 2026-07)

Findings live in this app now (`finding`, `finding_asset` with a real FK to `asset`, `finding_document`; see `docs/findings-merge-plan.md`). The findings UI is at `/findings`; the raise-finding loop on `/assets/[id]` is same-tab with a `return_to` round trip. Long-form finding descriptions remain ProseMirror documents in the federated document store, reached via the `connector` registry (`document-store` row). The former knowledge app and its `knowledge` database are decommissioned — the DB is kept as a backup until the merge has survived real use.
