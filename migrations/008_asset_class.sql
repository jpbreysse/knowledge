-- 008_asset_class.sql — asset-type taxonomy table.
--
-- ADDITIVE ONLY. This table stores per-class metadata that the UI will
-- consume to render forms, badges, and tabs dynamically — but in this
-- migration nothing in the existing app behaviour changes. The current
-- `CLASS_CODES` constant + `asset_class_code_check` constraint stay
-- authoritative for asset validation.
--
-- Once the dynamic-rendering wiring lands (v2.5+), `asset.class_code` will
-- foreign-key into `asset_class.code` instead of relying on the CHECK.
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/008_asset_class.sql

BEGIN;

CREATE TABLE asset_class (
	id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	code        TEXT NOT NULL UNIQUE
		CHECK (code ~ '^[A-Z][A-Z0-9-]{1,49}$'),
	label       TEXT NOT NULL,
	family      TEXT NOT NULL
		CHECK (family IN ('EQUIPMENT', 'STRUCTURAL', 'RELATIONSHIP', 'OTHER')),
	description TEXT,
	color       TEXT
		CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
	-- Array of field definitions: {name, label, type, required?, group?, unit?, options?}
	attribute_fields        JSONB NOT NULL DEFAULT '[]'::jsonb,
	-- Lifecycle states applicable to this class. [] = all states allowed.
	valid_lifecycle_states  JSONB NOT NULL DEFAULT '[]'::jsonb,
	-- Tab visibility on the detail page. [] = all tabs visible (legacy default).
	applicable_tabs         JSONB NOT NULL DEFAULT '[]'::jsonb,
	enabled    BOOLEAN NOT NULL DEFAULT TRUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_class_family ON asset_class (family);
CREATE INDEX idx_asset_class_enabled ON asset_class (enabled);

CREATE TRIGGER trg_asset_class_set_updated_at
	BEFORE UPDATE ON asset_class
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
