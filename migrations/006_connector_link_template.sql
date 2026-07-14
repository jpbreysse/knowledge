-- 006_connector_link_template.sql — add a per-connector URL template for
-- building the user-facing link to an individual document.
--
-- Why: connector.base_url points at the JSON API; the human-readable detail
-- page often lives on a different host (e.g. an SPA on a different port). We
-- need a separate template to build the click-through URL.
--
-- Placeholders supported: {id}, {base_url}. The template MUST contain {id}
-- so each linked doc gets a unique URL.
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/006_connector_link_template.sql

BEGIN;

ALTER TABLE connector
	ADD COLUMN link_template TEXT NOT NULL DEFAULT '{base_url}/documents/{id}'
		CHECK (position('{id}' in link_template) > 0);

COMMIT;
