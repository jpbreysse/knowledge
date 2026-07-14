-- 005_connectors.sql — Connectors registry + asset_document extended for external links.
--
-- New table `connector` describes an HTTP integration to another ArborSpace app
-- (or any external document store). For v2.2 only auth_type='none' is supported.
--
-- `asset_document` is widened so a row can EITHER be a local upload (stored_path)
-- OR an external link (connector_id + external_url). A CHECK constraint enforces
-- the XOR — never both, never neither.
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/005_connectors.sql

BEGIN;

CREATE TABLE connector (
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name        TEXT NOT NULL UNIQUE
		CHECK (name ~ '^[a-z0-9][a-z0-9-]{1,49}$'),
	label       TEXT NOT NULL,
	base_url    TEXT NOT NULL CHECK (base_url ~ '^https?://'),
	path_prefix TEXT,
	auth_type   TEXT NOT NULL DEFAULT 'none'
		CHECK (auth_type IN ('none')),
	enabled     BOOLEAN NOT NULL DEFAULT TRUE,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_connector_enabled ON connector (enabled);

CREATE TRIGGER trg_connector_set_updated_at
	BEFORE UPDATE ON connector
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Extend asset_document for external links
ALTER TABLE asset_document
	ALTER COLUMN stored_path DROP NOT NULL,
	ALTER COLUMN mime_type   DROP NOT NULL,
	ALTER COLUMN size_bytes  DROP NOT NULL,
	ADD COLUMN connector_id UUID REFERENCES connector(id) ON DELETE RESTRICT,
	ADD COLUMN external_url TEXT,
	ADD CONSTRAINT asset_document_source_check CHECK (
		(stored_path IS NOT NULL AND connector_id IS NULL AND external_url IS NULL)
		OR
		(stored_path IS NULL AND connector_id IS NOT NULL AND external_url IS NOT NULL)
	);

CREATE INDEX idx_asset_document_connector_id ON asset_document (connector_id);

COMMIT;
