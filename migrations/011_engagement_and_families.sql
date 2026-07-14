-- 011_engagement_and_families.sql — Lummus DD demo vertical (v3.1).
--
-- Two changes in one migration (both additive, no data loss):
--
-- 1. Widen asset_class.family CHECK with three new families:
--      PROJECT — engagements/mandates
--      PARTY   — sponsors / lenders / external advisors (moved from LAYER-1)
--      ASSET   — physical assets under DD (moved from LAYER-3)
--
--    Migrate the 5 classes that participate in the DD demo vertical:
--      SPON, LEND, EXTADV   → family='PARTY'
--      PHYS                 → family='ASSET'
--
--    The remaining LCI classes (METH/RFI/COMP/COMM/COMMP/SITE-VISIT/PLAY/
--    INDIV/TX/IER/CMR/ENG/ENGH) keep their LAYER-1/2/3 families — untouched.
--
-- 2. ENGAGEMENT is inserted as the new anchor class for the DD demo vertical.
--    Not added here in the migration — it lives in seed/012 alongside its
--    demo rows so class-taxonomy edits stay in seed files (build 008 pattern).
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/011_engagement_and_families.sql

BEGIN;

-- 1a. Widen family CHECK to include PROJECT / PARTY / ASSET
ALTER TABLE asset_class DROP CONSTRAINT IF EXISTS asset_class_family_check;
ALTER TABLE asset_class ADD CONSTRAINT asset_class_family_check CHECK (
	family IN (
		'EQUIPMENT',
		'STRUCTURAL',
		'RELATIONSHIP',
		'OTHER',
		'LAYER-1',
		'LAYER-2',
		'LAYER-3',
		'PROJECT',
		'PARTY',
		'ASSET'
	)
);

-- 1b. Migrate the 5 involved classes to their new families
UPDATE asset_class SET family = 'PARTY' WHERE code IN ('SPON', 'LEND', 'EXTADV');
UPDATE asset_class SET family = 'ASSET' WHERE code = 'PHYS';

COMMIT;
