# Build: Typed asset relationships (v2.0)

## Context

The v1 schema models the asset register as a strict tree via `asset.parent_id` (containment only). Subsequent specs have repeatedly hit the same wall — the v1.2 seed had to park motors as siblings to their pumps under `SYS-310` because the schema can't say "M-301A drives P-301A". This spec adds a separate table for non-containment edges.

What stays stable:
- The `asset` table and its `parent_id` column. **`parent_id` remains the canonical containment relationship** — do NOT backfill containment rows into the new table.
- Existing API routes, list/detail/tree/CSV/graph pages.
- All v1.x seed data.

What changes:
- New table `asset_relationship`.
- New API surface for relationships.
- Detail page gains a "Related assets" section.
- Graph page edges become typed (`contains` + `drives` + `feeds` + `connectedTo`).

## Goal

A v2.0 increment that lets a user record, view, and visualise **directed, typed relationships** between assets — independent of the containment tree — and that the existing graph view can render with distinct styling per type.

## Stack additions

None. Everything builds on the existing Drizzle + postgres.js + Cytoscape stack.

## Deliverables

### 1. Migration: `migrations/003_asset_relationship.sql`

Plain SQL. Wrapped in a transaction. Adds:

```sql
CREATE TABLE asset_relationship (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
    target_id   UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
    rel_type    TEXT NOT NULL CHECK (rel_type IN ('drives','feeds','connectedTo')),
    attributes  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  TEXT,
    CHECK (source_id <> target_id),
    UNIQUE (source_id, target_id, rel_type)
);

CREATE INDEX idx_asset_relationship_source ON asset_relationship (source_id);
CREATE INDEX idx_asset_relationship_target ON asset_relationship (target_id);
CREATE INDEX idx_asset_relationship_type   ON asset_relationship (rel_type);
```

**Rules**:
- All edges are directed. `connectedTo` is still stored as a single directed row; the UI surfaces both endpoints when listing.
- No self-loops, no exact duplicates (same source + target + type).
- Cycles are allowed — real plants have feedback loops.
- Cascading delete: if either endpoint asset is deleted, the relationship row goes with it.

No history/audit log for relationships in v2.0 (out of scope; revisit if needed).

### 2. Drizzle mirror

Update `src/lib/server/db/schema.ts` to add the new table. As before: hand-written SQL is the source of truth, Drizzle is just the typed query layer.

### 3. Vocabulary constants

Add to `src/lib/constants.ts`:

```ts
export const REL_TYPES = ['drives', 'feeds', 'connectedTo'] as const;
export type RelType = (typeof REL_TYPES)[number];

export const REL_TYPE_LABELS: Record<RelType, string> = {
    drives: 'Drives',
    feeds: 'Feeds',
    connectedTo: 'Connected to'
};
```

### 4. API routes

**New endpoints:**

- `GET  /api/assets/[id]/relationships` — returns both incoming and outgoing edges for the asset, with the *other* asset's tag/name/class joined in. Shape:

```json
{
  "outgoing": [
    { "id": "...", "rel_type": "drives", "target": { "id": "...", "tag": "P-301A", "name": "...", "class_code": "PUMP-CENTRIFUGAL" } }
  ],
  "incoming": [
    { "id": "...", "rel_type": "feeds", "source": { "id": "...", "tag": "...", "name": "...", "class_code": "..." } }
  ]
}
```

- `POST /api/assets/[id]/relationships` — create an edge where the path-param asset is the **source**. Body:

```json
{ "target_id": "<uuid>", "rel_type": "drives" }
```

  Returns the created row with HTTP 201, or 409 on duplicate, 400 on invalid type / self-reference / missing target.

- `DELETE /api/relationships/[relId]` — delete one edge. 204 on success.

**Modify the existing `GET /api/graph`** to also return typed edges:

```json
{
  "nodes": [...],
  "edges": [
    { "data": { "id": "contains-...", "source": "...", "target": "...", "rel_type": "contains" } },
    { "data": { "id": "<rel.id>",     "source": "...", "target": "...", "rel_type": "drives" } }
  ]
}
```

The `rel_type` field already exists on edges (added in v1.1 with always-`"contains"`), so no breaking change to the consumer shape. Containment edges keep their deterministic `contains-{src}-{tgt}` IDs; relationship edges use the row's UUID.

**Single-query rule**: the relationship and containment edges should come from at most two queries (one for `asset`, one for `asset_relationship`). No N+1.

### 5. Asset detail page (`/assets/[id]`)

Add a fourth tab between "Documents" and "History": **"Relationships"** (label includes count, e.g. `Relationships (3)`).

Tab contents:
- Two grouped lists: **Outgoing** and **Incoming**. Each row shows the relationship type as a badge, the other asset's tag (linked to `/assets/<other-id>`) and name.
- An inline "Add relationship" form: a `rel_type` dropdown (`Drives`, `Feeds`, `Connected to`), a target-asset combobox (typeahead by tag/name, queries `/api/assets?search=…`, excludes self), and an "Add" button.
- A small `×` next to each existing relationship to delete it (with `confirm()` prompt — keep it simple, no modal dialog).

Empty state: "No relationships yet. Add one above to model a `drives`, `feeds`, or `connectedTo` link."

### 6. Graph page (`/graph`)

Stylesheet additions in `src/routes/graph/+page.svelte`:

- Edge selectors keyed by `data(rel_type)`:
  - `contains` → keep current grey (`#8a9199`), 1.5px, bezier
  - `drives` → orange (`#e07a3d`), 2px, solid
  - `feeds` → blue (`#4a90c2`), 2px, solid
  - `connectedTo` → teal (`#5fa39a`), 1.5px, dashed (`line-style: dashed`)
- All typed edges keep the triangle target arrow.
- Update the legend in the control bar to show the four edge types alongside the existing class colours.

Behaviour additions:
- **Edge type filter**: a checkbox group above the canvas — `[x] Contains  [x] Drives  [x] Feeds  [x] Connected to`. Unchecking a type hides those edges (`cy.edges('[rel_type = "drives"]').style('display', 'none')`). Default: all on.
- The hover-fade (closedNeighborhood) keeps working; it just naturally now spans typed edges too.

No layout changes. Dagre still works fine even with cycles, since it'll skip back-edges.

### 7. Seed: `seed/003_relationships.sql`

Idempotent (`ON CONFLICT (source_id, target_id, rel_type) DO NOTHING`). Adds the relationships the previous seeds couldn't express:

- `M-301A` drives `P-301A`
- `M-301B` drives `P-301B`
- `M-301C` drives `P-301C`
- `P-301A` feeds `MET-331`
- `P-301B` feeds `MET-332`
- `TRAP-321` connectedTo `SYS-310`
- `SYS-310` connectedTo `TRAP-322`

Also for the cooling water tree:
- `P-101A` feeds `SYS-110` (cooling water loop)
- `P-101B` feeds `SYS-110`

Use subqueries on `asset.tag` to resolve UUIDs, same pattern as `seed/002_pumping_station.sql`.

### 8. npm script

Add `db:seed:003` to `package.json`:

```json
"db:seed:003": "psql \"$DATABASE_URL\" -v ON_ERROR_STOP=1 -f seed/003_relationships.sql"
```

Update `db:migrate` to also apply `migrations/003_asset_relationship.sql`.

### 9. Docs

- **Update `docs/data-model.md`**: new section for `asset_relationship` (columns, indexes, the directed-but-undirected-at-display semantics for `connectedTo`, the "containment lives in `parent_id` only" rule).
- **Update `docs/graph-view.md`**: edge styling mapping per `rel_type`, the new edge-type filter.
- **Update `docs/seed-data.md`**: short "Example 3 — Relationships" section listing the seed edges.
- **Update README.md "What's NOT in v1" → "What's NOT in v2"**: remove the typed-relationships line; note that bulk import, relationship history, and relationship attributes UI are still v3+.

## Scope boundaries — do NOT build

- **No relationship history table.** Created/deleted is enough; if we need an audit, add it later.
- **No `attributes` UI for relationships.** The JSONB column exists for the future (e.g. flow direction, design pressure on a pipe link); v2.0 ignores it.
- **No converting `parent_id` to relationship rows.** Containment stays in its dedicated column. The graph emits both kinds of edges separately.
- **No undirected/bidirectional helper.** `connectedTo` is stored as one directed row; the UI lists it from both endpoints by querying both `source_id = id` and `target_id = id`.
- **No new relationship types.** Vocabulary is locked at `drives`, `feeds`, `connectedTo` for v2.0. Adding more later means a small migration (drop+re-add CHECK).
- **No bulk relationship import.** One row per click, by design — bulk is v3+.
- **No graph layout that "knows" about types** (e.g. lining `feeds` chains horizontally). Dagre/cose stay generic.
- **No relationship search or filtering on `/assets`.** The list page stays containment-shaped.
- **No reverse-edge auto-creation.** Adding `A drives B` does not create `B drivenBy A` — there is no inverse vocabulary.

## Quality expectations

- The new endpoints validate input server-side (UUID format, `rel_type` in vocabulary, source ≠ target, both assets exist).
- The combobox in the detail-page form should debounce typeahead requests (300ms) and cap results at 20.
- Deleting a relationship returns 204 and the page invalidates without a full reload (`invalidateAll()`).
- `/api/graph` total query count stays at 2 (assets + relationships), regardless of asset count.
- The graph stylesheet's edge selectors live in the same `STYLESHEET` constant as nodes — no per-edge inline styling.
- No dark-mode regressions (still v2.0 — light mode only).

## Verification checklist

After build:

1. `migrations/003_asset_relationship.sql` applies cleanly. Re-applying after `DROP TABLE asset_relationship` recreates it identically.
2. POST `/api/assets/<P-301A id>/relationships` with `{target_id: <P-301B id>, rel_type: "drives"}` returns 201; immediately POSTing the same body returns 409.
3. POST with `target_id` = same id (self-loop) returns 400.
4. DELETE on the created row returns 204; GET on the asset shows it gone.
5. Deleting `P-301A` cascades the relationship rows where it appears as source or target (verify with a count before/after).
6. After running `seed/003_relationships.sql`, `/graph` shows orange edges between motors and pumps, blue edges from pumps to meters, dashed teal between traps and SYS-310.
7. Toggling the "Drives" filter checkbox hides/shows only the orange edges.
8. The asset detail page for `P-301A` shows: Outgoing (`feeds → MET-331`), Incoming (`drives ← M-301A`).
9. `/api/graph` returns nodes count + (containment edges count + relationship edges count) edges in a single round-trip per table.
10. `npm run check` and `npm run build` are clean (no new errors or warnings beyond the existing three).

## How to proceed

1. Read this spec fully.
2. Confirm: the existing `/api/graph` already emits `data.rel_type` on every edge (currently always `"contains"`), so v1.1 consumers won't break when relationship edges arrive.
3. Decide & confirm with me on the two real ambiguities:
   - **Edge filter UI** — checkboxes vs. multi-select pill toggle. (I've drafted checkboxes.)
   - **Combobox for target asset** — write from scratch or pull `cmdk-sv` / shadcn-svelte's `command` primitive. The latter adds one dep but matches the existing UI style.
4. Build in the order: migration → schema mirror → constants → API → detail-page UI → graph stylesheet + filter → seed → docs.
5. After each major step, tick the verification checklist.
6. Don't scope-creep. Bulk import, relationship history, and relationship attributes belong in v2.1+.
