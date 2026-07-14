# Plan — merge the findings app into the asset app

*Status: proposal. End state: **two** apps — asset registry (with findings
inside) + federated document store. The knowledge/findings app and its
separate `knowledge` database are decommissioned.*

## Why (recap)

The asset↔finding seam cuts through the domain's tightest loop: every finding
is about an asset; precedents span both; the v3.3 rules loop crosses the
boundary twice. Costs today: no FK integrity (`kn_finding_asset.asset_id` is
an unconstrained TEXT), cross-DB reads via a second pool, two UIs to keep
consistent, `return_to` plumbing for a round trip that shouldn't exist. The
clean seam — bulky documents in a swappable store — stays federated.

## What the findings app contains (audited 2026-07-14)

| Piece | Size | Notes |
|---|---|---|
| `kn_findings` | 11 rows | TEXT id (UUIDs), severity/status CHECKs, lifecycle timestamps (raised/reviewed/closed ×at/by), `attributes` JSONB, `description_doc_id` → ProseMirror doc in document-store + `description_html` write-on-fetch cache |
| `kn_finding_asset` | 10 rows | bridge, **no FK**, denormalized `asset_tag`/`asset_display` (cross-DB workaround) |
| `kn_finding_document` | 6 rows | bridge to doc-store documents, no FK by design |
| `kn_connectors` | 2 rows | richer than asset's `connector`: `auth_type` (none/api_key/bearer/basic), `auth_header`, `auth_value` |
| `kn_audit_log` | 104 rows | HTTP access log fed by `hooks.server.ts` on every `/api/*` request |
| `server/findings.ts` | 346 lines | raw postgres.js (no drizzle); list/get/create/update/delete, **status state machine** (`transitionFinding`), asset/doc link/unlink, description-cache refresh |
| `server/connector.ts` | 99 lines | `callConnector(name, path, opts)` — HTTP to doc store / asset registry |
| `server/prosemirror-html.ts` | 132 lines | pure renderer, no deps |
| API routes | 15 | findings CRUD, transition, assets/documents link-unlink, description-doc/-cache, export.csv, connectors, audit-log, 2 search proxies |
| Pages | 6 | findings list / detail (445 lines) / new, documents, connectors, audit |
| Deps not in asset app | | `zod`, `bits-ui`, `marked`, `dompurify`, `jsdom`, `@tailwindcss/typography`, `mode-watcher` |

## Design decisions (with recommendations)

1. **Table names — rename on the way in.** `kn_findings` → `finding`,
   `kn_finding_asset` → `finding_asset`, `kn_finding_document` →
   `finding_document`. Matches asset schema naming (singular, no prefix).
   One-time churn, clean forever.
2. **Real FK at last.** `finding_asset.asset_id` becomes `UUID REFERENCES
   asset(id) ON DELETE CASCADE`. Drop the denormalized `asset_tag`/
   `asset_display` columns — they existed only because cross-DB JOINs were
   impossible. Displays now JOIN `asset`.
3. **Connectors — one registry.** Add the auth columns (`auth_type` CHECK,
   `auth_header`, `auth_value`) to the existing `connector` table (nullable,
   default `none`). Import the `document-store` row; the `asset-registry`
   row dies (that's the whole point). One admin page at `/connectors`,
   extended with the auth fields.
4. **HTTP audit log — port it.** `audit_log` table + the 15-line
   `hooks.server.ts` pattern. Cheap, and it's part of the regulator story.
5. **Drop zod.** Rewrite the 3 small schemas (create/update/transition) as
   hand-rolled validators in the existing `validation.ts` style. No new
   validation framework in the asset app.
6. **Skip `marked`/`dompurify`/`jsdom`.** They served `description_md`,
   which migration 002 already dropped. Verify `markdown.ts` is dead code;
   don't port it or its 3 dependencies.
7. **Add `bits-ui` (+ copy dialog/dropdown-menu/card primitives).** The
   findings detail page needs them; they're the shadcn-svelte standard and
   half the ecosystem's components assume them. Alternative (hand-rolled
   modals like EntityLinksPanel) saves a dep but costs rewrite time on a
   445-line page.
8. **Keep description-as-document unchanged.** Findings' descriptions stay
   ProseMirror docs in the federated document store with the local HTML
   cache. `callConnector` ports as-is. This is the seam we're keeping.
9. **Keep raw postgres.js for the ported data layer.** `findings.ts` moves
   to `src/lib/server/findings.ts` using the existing `sqlClient` (the asset
   app already uses it for CTEs). No drizzle-ification in this pass —
   separate cleanup later if wanted.
10. **Finding writes get their own service choke point later.** For this
    merge, port the handlers as-is (they're already centralized in
    `findings.ts`). Extending `enforceTransactionRules` to finding writes is
    v3.3 work, now trivial because everything is in one transaction domain.

## Phases

**Phase 0 — safety.** ✅ git repo initialized, baseline committed
(`fadc68b`). Work on branch `merge-findings`.

**Phase 1 — schema + data (~1.5 h).**
- Migration 015: `finding`, `finding_asset` (FK CASCADE), `finding_document`,
  `audit_log`; add auth columns to `connector`; severity/status CHECKs and
  indexes carried over.
- One-shot copy script (`scripts/migrate-knowledge-db.mjs`): knowledge DB →
  `asset_dev`. Orphan check first: any `kn_finding_asset.asset_id` not in
  `asset` is reported and skipped, not silently imported. 27 rows total —
  trivial volume, but the orphan report matters (the old schema couldn't
  guarantee integrity; the new one will).
- Import `document-store` connector row with auth fields.

**Phase 2 — server layer (~2 h).**
- Port `findings.ts` (sqlClient + new table names + JOIN asset for
  tag/display), `connector.ts`, `prosemirror-html.ts`.
- Replace zod schemas with hand-rolled validators.
- Rewrite `findingsForAsset`/`precedentsForAsset` as single-DB queries
  (the recursive-CTE site walk and the findings fetch collapse into one
  query each). Delete `knowledge.ts` and the second pool.

**Phase 3 — API routes (~1.5 h).** Port 13 of 15 endpoints under
`/api/findings/*`, `/api/audit-log`. Drop: `/api/proxy/assets/search`
(direct `listAssets` now) and the connectors CRUD collision (extend asset's
existing `/api/connectors` with auth fields instead).

**Phase 4 — UI (~3 h).**
- Copy ui primitives (card, dialog, dropdown-menu) + `bits-ui`,
  `@tailwindcss/typography` (for description HTML).
- Port pages: `/findings` (list + filters), `/findings/[id]` (detail:
  transitions, asset links, document links, description editor round-trip),
  `/findings/new`, `/audit`. Adapt: AssetSearchModal → reuse the asset app's
  own AssetPicker (direct query, no proxy).
- Nav: add "Findings" to the layout; add findings to global search (S2) and
  the ⌘K palette.

**Phase 5 — close the loop on the asset page (~1.5 h).**
- FindingsPanel/PrecedentsPanel read local tables (no pool, no fallback
  needed — but keep graceful empty states).
- "Raise finding" becomes an internal link: `/findings/new?asset_id=…`,
  same tab; the new-finding page pre-links the asset and redirects back to
  `/assets/[id]` after save. The walkthrough becomes: click → type title →
  save → you're back on the pump, finding visible. No reload semantics to
  explain.
- Update `docs/demo-p407.md` + the `demo:p407` checklist accordingly.

**Phase 6 — cleanup + verify (~1.5 h).**
- Remove `KNOWLEDGE_DATABASE_URL`/`KNOWLEDGE_URL` from `.env*`, loader, and
  README; update the vision doc's architecture section (three apps → two).
- Smoke: findings CRUD + transition + link/unlink; P-407 loop end-to-end;
  precedents panel; import/export unaffected; `svelte-check` + build clean.
- Commit per phase on `merge-findings`; merge to `main` when green.
- Findings app: freeze the repo (reference only); keep the `knowledge` DB
  untouched as a backup until the merge has survived a week of demos, then
  drop.

**Total: ~11 h ≈ 1.5 days.**

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Orphaned finding→asset links (old schema had no FK) | Phase 1 orphan report before the FK is applied; skipped links listed, not lost silently (knowledge DB stays as backup) |
| Description-doc round-trip breaks in the new home | Port `callConnector` unchanged; the doc store contract is untouched; smoke-test the editor round-trip explicitly in Phase 6 |
| 445-line detail page port introduces UI regressions | Copy the needed ui primitives verbatim rather than adapting them; port page structure 1:1 first, restyle later |
| Losing the "swap components" sales story | The story *sharpens*: Data+Logic+Actions in one deployable, documents federated — update the vision doc in Phase 6, not after |
| v3.3 spec references the connector POST design | Add a note to `docs/v3.3-spec.md`: proposals become a local insert inside `enforceTransactionRules`'s transaction — simpler than spec'd |

## Out of scope

- Drizzle-ifying the ported findings data layer.
- Finding writes through a service choke point + rule hook (v3.3).
- Any change to the document-store app.
- Auth/multi-tenant.
