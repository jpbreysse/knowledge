-- 013_move_equipment_fields_to_attributes.sql — the "asset row is not
-- necessarily equipment" refactor.
--
-- Motivation: the ENGAGEMENT / SPON / LEND / etc. classes were rendering
-- form fields for `manufacturer` / `model` / `serial_no` / `commissioning_date`
-- / `lifecycle_state` — meaningless for non-equipment assets, because those
-- columns were hardcoded on the `asset` row. Everything class-specific should
-- live in `asset_class.attribute_fields` + `asset.attributes` JSONB.
--
-- What this migration does (in one transaction, data-preserving):
--   1. Copy every non-null value in the 7 equipment-flavoured columns into
--      `attributes` JSONB under the same key. jsonb_strip_nulls prevents
--      `{"manufacturer": null}` noise for assets that never had a value.
--   2. Drop the 7 columns.
--   3. Rewrite the audit trigger `log_asset_change()` so its `fields` array
--      no longer references the removed columns, and picks up the v3.0
--      additions (confidentiality, version, supersedes_asset_id) that were
--      silently missing from the array all along.
--   4. Drop the now-orphaned `idx_asset_lifecycle_state` index.
--
-- Seeds are updated in the same commit to put these fields under `attributes`
-- when re-inserted — see the modified seed.sql, seed/002/007/011/012 files.
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/013_move_equipment_fields_to_attributes.sql

BEGIN;

-- Step 1: copy column values → attributes JSONB
UPDATE asset
SET attributes = attributes || jsonb_strip_nulls(jsonb_build_object(
	'serial_no',           serial_no,
	'manufacturer',        manufacturer,
	'model',               model,
	'location',            location,
	'criticality',         criticality,
	'lifecycle_state',     lifecycle_state,
	'commissioning_date',  commissioning_date::text
));

-- Step 2: drop the equipment-specific columns
DROP INDEX IF EXISTS idx_asset_lifecycle_state;

ALTER TABLE asset
	DROP COLUMN serial_no,
	DROP COLUMN manufacturer,
	DROP COLUMN model,
	DROP COLUMN location,
	DROP COLUMN criticality,
	DROP COLUMN lifecycle_state,
	DROP COLUMN commissioning_date;

-- Step 3: rewrite the audit trigger to reference only the still-existing
-- columns AND to include the v3.0 additions that were missing.
CREATE OR REPLACE FUNCTION log_asset_change()
RETURNS TRIGGER AS $$
DECLARE
	who TEXT := NULLIF(current_setting('app.changed_by', true), '');
	fields TEXT[] := ARRAY[
		'tag','name','class_code','attributes','content','content_html',
		'parent_id','confidentiality','version','supersedes_asset_id'
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

COMMIT;
