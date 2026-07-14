-- 002_extend_class_codes.sql — widen the asset.class_code CHECK to include
-- MOTOR-ELECTRIC, PIG-TRAP, METER-CORIOLIS for the v1.2 seed.
--
-- Postgres CHECK constraints can't be altered in place; drop + re-add is the
-- standard pattern. Wrapped in a transaction so a partial failure rolls back.
-- Run with: psql "$DATABASE_URL" -f migrations/002_extend_class_codes.sql

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
		'OTHER'
	)
);

COMMIT;
