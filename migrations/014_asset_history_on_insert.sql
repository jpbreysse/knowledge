-- 014_asset_history_on_insert.sql
--
-- Close the INSERT audit gap: creations now leave an asset_history row, same
-- table format as the UPDATE trigger (field_name='created', old_value=NULL,
-- new_value=<tag>). One summary row per creation — not one per column — to
-- keep history readable.
--
-- Actor resolution matches log_asset_change(): GUC app.changed_by first
-- (set per-transaction by the asset-service via set_config(..., true)),
-- falling back to NEW.updated_by. All runtime writes go through the service,
-- which always sets the GUC; seeds insert directly and land here with their
-- updated_by value (or NULL) — the named exception.
--
-- DELETE logging remains a known gap (out of scope).

BEGIN;

CREATE OR REPLACE FUNCTION log_asset_insert()
RETURNS TRIGGER AS $$
DECLARE
	who TEXT := NULLIF(current_setting('app.changed_by', true), '');
BEGIN
	IF who IS NULL THEN who := NEW.updated_by; END IF;
	INSERT INTO asset_history (asset_id, changed_by, field_name, old_value, new_value)
	VALUES (NEW.id, who, 'created', NULL, NEW.tag);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asset_log_insert ON asset;
CREATE TRIGGER trg_asset_log_insert
	AFTER INSERT ON asset
	FOR EACH ROW
	EXECUTE FUNCTION log_asset_insert();

COMMIT;
