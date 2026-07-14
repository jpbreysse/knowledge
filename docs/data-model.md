# Data model

Three tables. No joins beyond parent-child on `asset.parent_id`.

## `asset`

The core object. Generic enough to cover sites, areas, systems, pumps, and other equipment; pump-specific technical data lives in the `attributes` JSONB column.

| Column               | Type         | Notes                                                                                                                                |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                 | UUID PK      | `gen_random_uuid()` default                                                                                                          |
| `tag`                | TEXT UNIQUE  | Functional tag, e.g. `P-101A`                                                                                                         |
| `serial_no`          | TEXT         |                                                                                                                                      |
| `name`               | TEXT         | Required                                                                                                                             |
| `class_code`         | TEXT CHECK   | `PUMP-CENTRIFUGAL`, `PUMP-POSITIVE-DISPLACEMENT`, `PUMP-SUBMERSIBLE`, `SITE`, `AREA`, `SYSTEM`, `OTHER` — enforced by CHECK constraint |
| `manufacturer`       | TEXT         |                                                                                                                                      |
| `model`              | TEXT         |                                                                                                                                      |
| `location`           | TEXT         | Free text (v1)                                                                                                                       |
| `criticality`        | SMALLINT     | 1–5, nullable, CHECK-constrained                                                                                                     |
| `lifecycle_state`    | TEXT CHECK   | `planned`, `operating`, `standby`, `shutdown`, `decommissioned`                                                                      |
| `commissioning_date` | DATE         |                                                                                                                                      |
| `attributes`         | JSONB        | `'{}'::jsonb` default. See "Pump attributes" below.                                                                                  |
| `content`            | JSONB        | Tiptap document JSON                                                                                                                 |
| `content_html`       | TEXT         | Read cache, regenerated server-side from `content` on every write                                                                    |
| `parent_id`          | UUID FK      | Self-reference, `ON DELETE RESTRICT` — an asset with children cannot be deleted                                                      |
| `created_at`         | TIMESTAMPTZ  |                                                                                                                                      |
| `updated_at`         | TIMESTAMPTZ  | Maintained by trigger `trg_asset_set_updated_at`                                                                                     |
| `updated_by`         | TEXT         | Set by the API on every write                                                                                                        |

### Indexes

`tag` (unique), `class_code`, `parent_id`, `lifecycle_state`.

### Pump attributes (in `attributes` JSONB, only when `class_code` starts with `PUMP-`)

| Key                     | Type    |
| ----------------------- | ------- |
| `rated_flow_m3h`        | number  |
| `rated_head_m`          | number  |
| `rated_power_kw`        | number  |
| `suction_pressure_bar`  | number  |
| `discharge_pressure_bar`| number  |
| `fluid`                 | text    |
| `speed_rpm`             | number  |
| `npsh_required_m`       | number  |

Validation happens at the API layer; the database only enforces JSONB-ness.

## `asset_document`

| Column        | Type        | Notes                                                    |
| ------------- | ----------- | -------------------------------------------------------- |
| `id`          | UUID PK     |                                                          |
| `asset_id`    | UUID FK     | `ON DELETE CASCADE`                                      |
| `filename`    | TEXT        | Original client-provided name                            |
| `stored_path` | TEXT        | Relative path under `UPLOAD_DIR`: `<asset_id>/<uuid>-<name>` |
| `mime_type`   | TEXT        | Derived from magic bytes at upload time                  |
| `size_bytes`  | BIGINT      |                                                          |
| `description` | TEXT        |                                                          |
| `uploaded_at` | TIMESTAMPTZ |                                                          |
| `uploaded_by` | TEXT        |                                                          |

Index: `asset_id`.

## `asset_history`

Append-only audit log. One row per column whose value changed on UPDATE.

| Column       | Type        | Notes                                                                                |
| ------------ | ----------- | ------------------------------------------------------------------------------------ |
| `id`         | UUID PK     |                                                                                      |
| `asset_id`   | UUID FK     | `ON DELETE CASCADE`                                                                  |
| `changed_at` | TIMESTAMPTZ |                                                                                      |
| `changed_by` | TEXT        | From `current_setting('app.changed_by', true)` set by the API per transaction        |
| `field_name` | TEXT        | Column name on `asset`                                                               |
| `old_value`  | TEXT        | Cast-to-text value before update                                                     |
| `new_value`  | TEXT        | Cast-to-text value after update                                                      |

Populated by trigger `trg_asset_log_change` (`AFTER UPDATE`, `WHEN OLD IS DISTINCT FROM NEW`). `updated_at` and `updated_by` are deliberately excluded from the list of fields scanned — they'd add noise without signal.

Index: `(asset_id, changed_at DESC)` — supports the "last 50 changes" query on the detail page.

## Future: extending `class_code`

The enum is deliberately small. When we need more equipment types, the taxonomy source should be one of:

- [**ISO 14224**](https://www.iso.org/standard/64076.html) — "Petroleum, petrochemical and natural gas industries — Collection and exchange of reliability and maintenance data for equipment". Defines equipment classes at several hierarchy levels (equipment unit → subunit → maintainable item → part). Good fit if you want to share failure / maintenance data with industry databases.
- [**CFIHOS**](https://www.jip36-cfihos.org/) — "Capital Facilities Information Handover Specification". Broader reference-data standard used across process-plant operators; includes an equipment classification library aligned with ISO 14224.

Both define hierarchical codes (e.g. `P-CE-S` for single-stage centrifugal pumps). If we switch, map existing `PUMP-*` codes to the chosen standard in a migration rather than renaming in place — the `class_code` column is cheap text with a CHECK constraint; widen the CHECK and add the new values.
