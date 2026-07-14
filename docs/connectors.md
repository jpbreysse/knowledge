# Connectors — v2.2

A `connector` is a stored configuration pointing at an external HTTP document store (the ArborSpace document app, an internal SharePoint, S3, etc.). Once a connector exists and is enabled, the asset Documents tab gets a **Link from connector** form for attaching external docs to an asset by URL — no file copy, no bytes stored locally.

## Data model

`connector` table:

| Column        | Type         | Notes                                                                          |
| ------------- | ------------ | ------------------------------------------------------------------------------ |
| `id`          | UUID PK      |                                                                                |
| `name`        | TEXT UNIQUE  | Slug — `^[a-z0-9][a-z0-9-]{1,49}$`. Technical identifier.                      |
| `label`       | TEXT         | Display name (shown in dropdowns, badges).                                     |
| `base_url`    | TEXT         | Must start with `http://` or `https://`.                                       |
| `path_prefix` | TEXT         | Optional. Must start with `/`. Cosmetic in v2.2 (no browse picker yet).        |
| `auth_type`   | TEXT         | Only `none` accepted in v2.2. Bearer / API key / OAuth come later.             |
| `enabled`     | BOOLEAN      | Disabled connectors don't appear in the asset → Link form.                     |
| `created_at`  | TIMESTAMPTZ  |                                                                                |
| `updated_at`  | TIMESTAMPTZ  | Auto-set by `set_updated_at()` trigger.                                        |

`asset_document` is widened so a row is **either** a local upload **or** a connector link (XOR enforced by a CHECK):

| Column         | Local upload | Connector link |
| -------------- | ------------ | -------------- |
| `stored_path`  | NOT NULL     | NULL           |
| `mime_type`    | usually set  | NULL           |
| `size_bytes`   | usually set  | NULL           |
| `connector_id` | NULL         | NOT NULL       |
| `external_url` | NULL         | NOT NULL       |
| `filename`     | NOT NULL     | NOT NULL       |

`connector.id` is referenced by `asset_document.connector_id` with `ON DELETE RESTRICT` — you cannot delete a connector that still has linked documents pointing at it.

## API

| Method | Path | Behaviour |
| --- | --- | --- |
| `GET` | `/api/connectors` | List all, ordered by name. `?enabled=true` filters. |
| `POST` | `/api/connectors` | Create. 201 / 400 (validation) / 409 (duplicate name). |
| `GET` | `/api/connectors/[id]` | Single row. |
| `PATCH` | `/api/connectors/[id]` | Update any subset of fields. |
| `DELETE` | `/api/connectors/[id]` | 204 / 409 if any linked doc references it. |
| `POST` | `/api/assets/[id]/documents` | Multipart `file=…` → upload. JSON `{connector_id, external_url, filename}` → link. |
| `GET` | `/api/assets/[id]/documents/[docId]` | Streams the local file. **404 for linked docs** — the UI links to `external_url` directly. |

## UI tour

| Page | What it shows |
| --- | --- |
| Top nav | New `Connectors` link beside `Graph`. |
| `/connectors` | Table of all connectors with Edit / Delete actions and a green `enabled` pill. |
| `/connectors/new` | Empty form. |
| `/connectors/[id]` | Same form prefilled, plus Save / Delete / Close. |
| `/assets/[id]` Documents tab | Existing upload form, plus a **Link from connector** card with connector dropdown + URL + display filename. The documents list mixes both kinds — uploaded rows show file icon + size; linked rows show link icon + connector label badge and open in a new tab. |

## Adding a connector

Two paths:

1. **Admin UI:** `/connectors/new` → fill in name (slug), label, base URL, optional path prefix. Auth stays at `none`. Enabled by default.
2. **Direct SQL** for repeatable seeding — see `seed/005_connectors.sql` for the pattern, or:
   ```sql
   INSERT INTO connector (name, label, base_url, path_prefix, auth_type, enabled)
   VALUES ('knowledge', 'ArborSpace Knowledge', 'http://localhost:5180', '/api', 'none', TRUE)
   ON CONFLICT (name) DO NOTHING;
   ```

## v2.2 limitations

- **No browse picker** — paste URLs by hand. Browse comes when the document app exposes a listing API (v2.3).
- **No real auth flows.** `auth_type` only accepts `none`. Adding `bearer` / `api_key` / `oauth2` later means widening the CHECK constraint and adding a `credentials JSONB` column.
- **No connection-test button.** `enabled` is the only signal.
- **No file copy / import.** Linking only — the bytes stay at source.
- **No bulk operations** (no "import all PDFs from this folder").
- **No connector audit log** beyond the per-asset history that already records document additions implicitly via `asset_history`.
