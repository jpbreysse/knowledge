# Bulk import — UI flow sketch (v1)

*Per-class CSV import. Design pinned before build. Effort estimate: 4-6 hours.*

---

## Design principle

**One class, one CSV, one dry-run, one commit.** No multi-class files, no updates, no attachments — those come later. The class is the schema; the CSV must match it.

---

## Entry points

| Where | Trigger | Behaviour |
|---|---|---|
| `/asset-types/[code]` | `[Download CSV template]` + `[Import from CSV →]` buttons in the page header | Class pre-selected in the importer |
| `/assets` | `[+ Import]` button next to `[+ New asset]` | Opens the importer with an empty class picker |
| `⌘K` command palette | Action `Import assets…` | Opens the importer |

Primary entry is the class page — the user is already looking at the schema they want to fill.

---

## Route

`/assets/import` — single SvelteKit page. State machine has three visible steps, all on one screen:

```
[1. Class + File]  →  [2. Preview]  →  [3. Done]
```

---

## Step 1 — Class + File

```
┌─ Import assets ──────────────────────────────────────────────┐
│                                                              │
│  1. Class                                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ PUMP-CENTRIFUGAL ▾                                     │  │
│  └────────────────────────────────────────────────────────┘  │
│  Family: EQUIPMENT · Prefix: p- · Fields: 12                 │
│                                                              │
│  [↓ Download CSV template]                                   │
│                                                              │
│  2. File                                                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Drop CSV here or click to choose                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│                                    [Preview import →]        │
└──────────────────────────────────────────────────────────────┘
```

- Class dropdown groups by family. Pre-selected if `?class=…` in URL.
- Template download is a `GET /api/asset-classes/[code]/import-template.csv` — headers only, plus one example row prefixed with `#example` in the tag column (stripped by the importer).
- File input accepts `.csv` only. Parsed in the browser with `papaparse` (~35 KB).

---

## Step 2 — Preview

Full-width table of every row in the CSV, validated against the class schema.

```
┌─ Preview — pumps.csv · 24 rows · class PUMP-CENTRIFUGAL ─────┐
│                                                              │
│   22 ready  ·  2 errors  ·  0 duplicates                     │
│                                                              │
│   Filter: [ All (24) | ✓ Ready (22) | ✗ Errors (2) ]         │
│                                                              │
│  ┌──┬──────────┬─────────────────┬──────────┬─────────────┐  │
│  │# │ tag      │ name            │ parent   │ status      │  │
│  ├──┼──────────┼─────────────────┼──────────┼─────────────┤  │
│  │1 │ p-501    │ Feed pump A     │ area-3   │ ✓           │  │
│  │2 │ p-502    │ Feed pump B     │ area-3   │ ✓           │  │
│  │3 │ p-503    │ Booster         │ area-4   │ ✗ parent    │  │
│  │  │          │                 │          │   'area-4'  │  │
│  │  │          │                 │          │   not found │  │
│  │4 │ p-501    │ Duplicate tag   │ area-3   │ ✗ tag exists│  │
│  │  │          │                 │          │   in DB     │  │
│  │…                                                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Click any row to expand and see all fields.                 │
│                                                              │
│    [← Change file]              [Import 22 valid rows →]     │
└──────────────────────────────────────────────────────────────┘
```

- Errors are per-cell, listed under the row when expanded.
- If any row errors → `[Import N valid rows]` skips the bad rows (soft mode). A checkbox `[ ] Fail whole import on any error` toggles hard mode. Default is soft.
- `[← Change file]` returns to step 1 without losing the class selection.

**Expanded row detail (click to open)**:

```
  ┌ Row 3 · p-503 ──────────────────────────────────────────┐
  │  tag              p-503                                 │
  │  name             Booster                               │
  │  parent_tag       area-4     ✗ not found                │
  │  confidentiality  internal                              │
  │  manufacturer     Sulzer                                │
  │  model            APP-42                                │
  │  criticality      high                                  │
  │  lifecycle_state  operating                             │
  │  …                                                      │
  └─────────────────────────────────────────────────────────┘
```

---

## Step 3 — Done

```
┌─ Imported ───────────────────────────────────────────────────┐
│                                                              │
│  ✓ 22 pumps imported                                         │
│                                                              │
│  [View in list]   [Import more]   [Back to class page]       │
└──────────────────────────────────────────────────────────────┘
```

`[View in list]` → `/assets?class=PUMP-CENTRIFUGAL&recent=1` filter.

---

## Column contract

For every class the CSV columns are:

| Column | Required | Notes |
|---|---|---|
| `tag` | yes | Unique. If empty, auto-generated from `id_prefix`. |
| `name` | yes | Free text. |
| `parent_tag` | no | Resolved by tag. Empty = no parent. |
| `confidentiality` | no | `public`/`internal`/`restricted`. Empty = class default. |
| *`<field.key>`* × N | per class | One column per attribute in `class.attribute_fields`. |

**Attribute cell encoding**:

| Field type | CSV cell format | Example |
|---|---|---|
| `text` | as-is | `Sulzer` |
| `number` | integer or decimal | `1450` |
| `date` | ISO | `2024-06-15` |
| `select` | one of `options` | `high` |
| `boolean` | `true`/`false`/`yes`/`no`/`1`/`0` | `true` |
| `list` | semicolon-separated | `commissioned;operating` |
| `ref` | tag of target asset | `spon-002` |
| `array_ref` | semicolon-separated tags | `lend-001;lend-002;idb-invest` |
| `object` | JSON string | `{"phase":"FEED"}` — advanced |

**Unknown columns** → warning banner at top of preview, columns ignored.

---

## Validation rules (client + server, server is authoritative)

Per row:
1. `tag` unique within the file
2. `tag` not already in DB (unless empty → auto)
3. `name` non-empty
4. Every required field has a value (required = class field `required: true`)
5. Types match the field's declared type
6. `select` values in `options`
7. `ref` and `array_ref` tags exist in DB
8. `parent_tag` exists in DB
9. If class has `parent_class_filter`, parent must be one of those classes

Per file:
10. Header row matches expected columns (extras warned, missing required errors)
11. No duplicate tags within the file

---

## Server side — commit

`POST /api/assets/import`:

```
{
  class_code: "PUMP-CENTRIFUGAL",
  rows: [ {tag, name, parent_tag, confidentiality, attributes: {...}}, ... ],
  mode: "soft" | "hard"
}
```

- Re-validates every row (never trust the client).
- Wraps in one transaction.
- `soft` mode: skips invalid rows, returns `{created: [...], skipped: [...]}`.
- `hard` mode: rolls back on any invalid row, returns `{errors: [...]}`.
- Emits one `asset_history` row per created asset (`change_type = 'import'`, `import_batch_id` = UUID for the batch — future audit).

---

## Out of scope for v1 (deferred, easy to add later)

- Excel `.xlsx` upload (add later with dropdowns for `select` fields)
- Update existing assets by tag
- Bulk-import entity links from a second CSV
- Multi-class file with `class_code` column
- Attachments / document uploads per row
- Undo an import batch (needs the `import_batch_id` above)

---

## Effort breakdown

| Piece | Time |
|---|---|
| `/assets/import` page + Svelte state machine | 90 min |
| Client-side CSV parse + validate against class schema | 60 min |
| Preview table with row expansion | 60 min |
| `GET /api/asset-classes/[code]/import-template.csv` | 15 min |
| `POST /api/assets/import` with transaction + tag resolution | 90 min |
| Entry-point buttons on `/asset-types/[code]` and `/assets` | 20 min |
| Command palette action | 10 min |
| Smoke test with 3 classes | 30 min |
| **Total** | **~6 h** |

---

## Open questions to confirm before build

1. **Auto-tag when empty?** If a row has no `tag`, generate `p-006`, `p-007`… from the class `id_prefix` and the current max. Yes/no?
2. **Soft mode default?** Import valid rows even if some fail — or reject the whole file? I lean soft (matches how partners actually work with messy client CSVs).
3. **`object` field type in v1?** JSON-in-a-cell is ugly. Skip for v1, force via API only?
4. **Header case-sensitivity?** I'd match case-insensitive with whitespace trim.
