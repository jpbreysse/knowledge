-- NOTE: seeds bypass the asset write service (src/lib/server/asset-service.ts): no validation, no rules — fixtures only. Runtime writes must go through createAsset/updateAsset.
-- 005_connectors.sql — seed the default connector pointing at the document store.
--
-- The link_template targets the document-store SPA which lives on a different
-- port than its API (API: :3001/api/docs, UI: :5173/?id=<id>). Without the
-- override, links built from the default template would 404 against the API host.
--
-- Idempotent via the unique name. Re-running updates the label/url/template.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed/005_connectors.sql

BEGIN;

INSERT INTO connector (name, label, base_url, path_prefix, auth_type, enabled, link_template)
VALUES (
	'document-store',
	'Document Store',
	'http://localhost:3001',
	'/api',
	'none',
	TRUE,
	'http://localhost:5173/?id={id}'
)
ON CONFLICT (name) DO UPDATE SET
	label         = EXCLUDED.label,
	base_url      = EXCLUDED.base_url,
	path_prefix   = EXCLUDED.path_prefix,
	auth_type     = EXCLUDED.auth_type,
	enabled       = EXCLUDED.enabled,
	link_template = EXCLUDED.link_template;

COMMIT;