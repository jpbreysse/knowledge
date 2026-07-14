-- 007_extend_class_codes_lender.sql — widen the asset.class_code CHECK to
-- include LENDER-CONTEXT (a non-equipment asset type used to track lender
-- relationships in a project-finance context).
--
-- Same drop+re-add pattern as migration 002. Wrapped in a transaction so a
-- partial failure rolls back. Existing data is untouched.
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/007_extend_class_codes_lender.sql

BEGIN;

ALTER TABLE asset DROP CONSTRAINT IF EXISTS asset_class_code_check;

ALTER TABLE asset ADD CONSTRAINT asset_class_code_check CHECK (
	class_code IN (
		'PUMP-CENTRIFUGAL',
		'PUMP-POSITIVE-DISPLACEMENT',
		'PUMP-SUBMERSIBLE',
		'MOTOR-ELECTRIC',
		'PIG-TRAP',
		'METER-CORIOLIS',
		'SITE',
		'AREA',
		'SYSTEM',
		'LENDER-CONTEXT',
		'OTHER'
	)
);

COMMIT;
