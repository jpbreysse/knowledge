-- 015_findings_merge.sql — merge the findings app's schema into asset_dev.
--
-- The knowledge app's kn_* tables move here (renamed: finding, finding_asset,
-- finding_document, audit_log) with one crucial upgrade: finding_asset gains
-- a REAL foreign key to asset(id). The old cross-DB design couldn't have one,
-- which is why it carried denormalized asset_tag/asset_display columns —
-- those die here; displays JOIN asset instead.
--
-- Also: connector gains the auth columns the kn_connectors registry had
-- (api_key/bearer/basic), so one registry serves both document linking and
-- the description-doc round-trip.
--
-- Data is copied separately by scripts/migrate-knowledge-db.mjs (with an
-- orphan report BEFORE the FK can reject anything).

BEGIN;

-- ---------------------------------------------------------------------------
-- finding — the finding itself (id stays TEXT: existing ids are UUIDs-as-text)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding (
	id                    TEXT PRIMARY KEY,
	finding_type          TEXT NOT NULL DEFAULT 'inspection',
	title                 TEXT NOT NULL,
	severity              TEXT NOT NULL,
	status                TEXT NOT NULL DEFAULT 'raised',

	-- Description lives as a ProseMirror doc in the federated document store;
	-- description_html is a write-on-fetch cache for list/search/CSV.
	description_doc_id    TEXT,
	description_html      TEXT,
	description_synced_at TIMESTAMPTZ,

	attributes            JSONB NOT NULL DEFAULT '{}',

	raised_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	raised_by             TEXT,
	reviewed_at           TIMESTAMPTZ,
	reviewed_by           TEXT,
	closed_at             TIMESTAMPTZ,
	closed_by             TEXT,

	created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_by            TEXT,

	CONSTRAINT finding_severity_valid
		CHECK (severity IN ('low', 'medium', 'high', 'critical')),
	CONSTRAINT finding_status_valid
		CHECK (status IN ('raised', 'reviewed', 'accepted', 'mitigated', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_finding_severity  ON finding (severity);
CREATE INDEX IF NOT EXISTS idx_finding_status    ON finding (status);
CREATE INDEX IF NOT EXISTS idx_finding_raised_at ON finding (raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_finding_type      ON finding (finding_type);
CREATE INDEX IF NOT EXISTS idx_finding_desc_doc  ON finding (description_doc_id);

-- ---------------------------------------------------------------------------
-- finding_asset — which assets a finding concerns. Real FK at last.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding_asset (
	finding_id TEXT NOT NULL REFERENCES finding(id) ON DELETE CASCADE,
	asset_id   UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
	linked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (finding_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_finding_asset_asset ON finding_asset (asset_id);

-- ---------------------------------------------------------------------------
-- finding_document — supporting documents in the federated store. No FK by
-- design: document ids live in another app; the connector owns that boundary.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding_document (
	finding_id     TEXT NOT NULL REFERENCES finding(id) ON DELETE CASCADE,
	document_id    TEXT NOT NULL,
	document_title TEXT,
	linked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (finding_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_finding_document_doc ON finding_document (document_id);

-- ---------------------------------------------------------------------------
-- audit_log — append-only HTTP access log (fed by hooks.server.ts on /api/*)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	method      TEXT NOT NULL,
	path        TEXT NOT NULL,
	status      INT,
	duration_ms INT,
	ip          TEXT,
	user_agent  TEXT,
	body_size   INT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log (ts DESC);

-- ---------------------------------------------------------------------------
-- connector — gain the auth capabilities kn_connectors had
-- ---------------------------------------------------------------------------
ALTER TABLE connector
	ADD COLUMN IF NOT EXISTS auth_header TEXT,
	ADD COLUMN IF NOT EXISTS auth_value  TEXT;

ALTER TABLE connector DROP CONSTRAINT IF EXISTS connector_auth_type_check;
ALTER TABLE connector ADD CONSTRAINT connector_auth_type_check
	CHECK (auth_type IN ('none', 'api_key', 'bearer', 'basic'));

COMMIT;
