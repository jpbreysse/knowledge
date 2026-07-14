-- 010_drop_class_code_check.sql — make asset_class the authoritative class registry.
--
-- The original asset.class_code CHECK held a hardcoded list of pump-era class
-- codes (PUMP-CENTRIFUGAL, MOTOR-ELECTRIC, SITE/AREA/SYSTEM, LENDER-CONTEXT,
-- OTHER, …) and was the gate on which class strings were allowed. With the
-- asset_class taxonomy table in place (migration 008) that's now the wrong
-- enforcement point — adding a class via the admin UI doesn't help if the
-- DB still rejects assets of that class.
--
-- Drop the CHECK. Enforcement moves to the API layer, which looks up the class
-- in asset_class and rejects unknown codes with a 400.
--
-- A foreign key (asset.class_code -> asset_class.code) is the natural next
-- step but is deferred — it requires asset_class.code to be re-typed UNIQUE
-- (it already is) and changes ON DELETE semantics for the class. Pick that up
-- when the LCI seed lands (P3).
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/010_drop_class_code_check.sql

BEGIN;

ALTER TABLE asset DROP CONSTRAINT IF EXISTS asset_class_code_check;

COMMIT;
