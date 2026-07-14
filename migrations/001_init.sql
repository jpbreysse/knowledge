-- 001_init.sql — asset registry v1 schema
-- Run with: psql "$DATABASE_URL" -f migrations/001_init.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- asset
-- ----------------------------------------------------------------------------
CREATE TABLE asset (
	id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	tag                 TEXT NOT NULL UNIQUE,
	serial_no           TEXT,
	name                TEXT NOT NULL,
	class_code          TEXT NOT NULL
		CHECK (class_code IN (
			'PUMP-CENTRIFUGAL',
			'PUMP-POSITIVE-DISPLACEMENT',
			'PUMP-SUBMERSIBLE',
			'SITE',
			'AREA',
			'SYSTEM',
			'OTHER'
		)),
	manufacturer        TEXT,
	model               TEXT,
	location            TEXT,
	criticality         SMALLINT CHECK (criticality BETWEEN 1 AND 5),
	lifecycle_state     TEXT
		CHECK (lifecycle_state IN ('planned', 'operating', 'standby', 'shutdown', 'decommissioned')),
	commissioning_date  DATE,
	attributes          JSONB NOT NULL DEFAULT '{}'::jsonb,
	content             JSONB,
	content_html        TEXT,
	parent_id           UUID REFERENCES asset(id) ON DELETE RESTRICT,
	created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_by          TEXT
);

CREATE INDEX idx_asset_class_code      ON asset (class_code);
CREATE INDEX idx_asset_parent_id       ON asset (parent_id);
CREATE INDEX idx_asset_lifecycle_state ON asset (lifecycle_state);
-- tag already has a unique index via UNIQUE constraint.

-- ----------------------------------------------------------------------------
-- asset_document
-- ----------------------------------------------------------------------------
CREATE TABLE asset_document (
	id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	asset_id     UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
	filename     TEXT NOT NULL,
	stored_path  TEXT NOT NULL,
	mime_type    TEXT,
	size_bytes   BIGINT,
	description  TEXT,
	uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	uploaded_by  TEXT
);

CREATE INDEX idx_asset_document_asset_id ON asset_document (asset_id);

-- ----------------------------------------------------------------------------
-- asset_history
-- ----------------------------------------------------------------------------
CREATE TABLE asset_history (
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	asset_id    UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
	changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	changed_by  TEXT,
	field_name  TEXT NOT NULL,
	old_value   TEXT,
	new_value   TEXT
);

CREATE INDEX idx_asset_history_asset_changed ON asset_history (asset_id, changed_at DESC);

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at := NOW();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asset_set_updated_at
	BEFORE UPDATE ON asset
	FOR EACH ROW
	EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------------------
-- history trigger
-- Emits one asset_history row per column whose value changed on UPDATE.
-- Skips updated_at/updated_by themselves (noise).
-- changed_by is pulled from GUC app.changed_by (SET LOCAL app.changed_by = '…'
-- before the UPDATE); falls back to NEW.updated_by then NULL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_asset_change()
RETURNS TRIGGER AS $$
DECLARE
	who TEXT := NULLIF(current_setting('app.changed_by', true), '');
	fields TEXT[] := ARRAY[
		'tag','serial_no','name','class_code','manufacturer','model','location',
		'criticality','lifecycle_state','commissioning_date','attributes',
		'content','content_html','parent_id'
	];
	f TEXT;
	old_v TEXT;
	new_v TEXT;
BEGIN
	IF who IS NULL THEN who := NEW.updated_by; END IF;

	FOREACH f IN ARRAY fields LOOP
		EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f)
			INTO old_v, new_v
			USING OLD, NEW;
		IF old_v IS DISTINCT FROM new_v THEN
			INSERT INTO asset_history (asset_id, changed_by, field_name, old_value, new_value)
			VALUES (NEW.id, who, f, old_v, new_v);
		END IF;
	END LOOP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_asset_log_change
	AFTER UPDATE ON asset
	FOR EACH ROW
	WHEN (OLD IS DISTINCT FROM NEW)
	EXECUTE FUNCTION log_asset_change();

COMMIT;
