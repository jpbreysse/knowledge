-- 009_lci_schema.sql — schema plumbing for the LCI three-layer asset register.
--
-- Pure ADDITIVE migration. No data rewrite, no NOT NULL on new columns, no
-- existing rows invalidated. Lummus seed data is unaffected.
--
-- Adds:
--  - asset_class.family CHECK widened with LAYER-1 / LAYER-2 / LAYER-3
--  - asset_class.id_prefix (e.g. 'phys-', 'tx-') for upload-time tag generation
--  - asset_class.confidentiality_default (public/client-shareable/internal/restricted)
--  - asset.version + asset.supersedes_asset_id (for IER, methodology, playbook versioning)
--  - asset.confidentiality (per-row override of class default)
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/009_lci_schema.sql

BEGIN;

-- 1. Widen asset_class.family CHECK (drop + re-add, mirrors migration 002 pattern)
ALTER TABLE asset_class DROP CONSTRAINT IF EXISTS asset_class_family_check;
ALTER TABLE asset_class ADD CONSTRAINT asset_class_family_check CHECK (
	family IN (
		'EQUIPMENT',
		'STRUCTURAL',
		'RELATIONSHIP',
		'OTHER',
		'LAYER-1',
		'LAYER-2',
		'LAYER-3'
	)
);

-- 2. asset_class.id_prefix — fixed slug prefix per class (e.g. 'phys-').
--    Pattern enforced loosely; the LCI spec uses lowercase + hyphen only.
ALTER TABLE asset_class
	ADD COLUMN id_prefix TEXT
		CHECK (id_prefix IS NULL OR id_prefix ~ '^[a-z][a-z0-9-]{1,19}$');

-- 3. asset_class.confidentiality_default — falls back to NULL = no default
ALTER TABLE asset_class
	ADD COLUMN confidentiality_default TEXT
		CHECK (confidentiality_default IS NULL OR confidentiality_default IN (
			'public', 'client-shareable', 'internal', 'restricted'
		));

-- 4. asset.confidentiality — per-row override
ALTER TABLE asset
	ADD COLUMN confidentiality TEXT
		CHECK (confidentiality IS NULL OR confidentiality IN (
			'public', 'client-shareable', 'internal', 'restricted'
		));

CREATE INDEX idx_asset_confidentiality ON asset (confidentiality) WHERE confidentiality IS NOT NULL;

-- 5. asset.version + asset.supersedes_asset_id — versioning chain
ALTER TABLE asset
	ADD COLUMN version TEXT,
	ADD COLUMN supersedes_asset_id UUID REFERENCES asset(id) ON DELETE SET NULL;

CREATE INDEX idx_asset_supersedes ON asset (supersedes_asset_id) WHERE supersedes_asset_id IS NOT NULL;

COMMIT;
