-- NOTE: seeds bypass the asset write service (src/lib/server/asset-service.ts): no validation, no rules — fixtures only. Runtime writes must go through createAsset/updateAsset.
-- seed.sql — example data for asset registry
-- Run with: psql "$DATABASE_URL" -f seed.sql
-- Idempotent: safe to re-run (truncates tables first).
--
-- v3.1: equipment-flavoured fields (manufacturer, model, serial_no, location,
-- criticality, lifecycle_state, commissioning_date) live in the `attributes`
-- JSONB column now — migration 013 moved them off the asset row.

BEGIN;

TRUNCATE asset_history, asset_document, asset RESTART IDENTITY CASCADE;

-- Hierarchy: site → area → system → pumps
WITH
	site AS (
		INSERT INTO asset (tag, name, class_code, attributes)
		VALUES ('SITE-01', 'North Site', 'SITE',
			'{"location":"Port Industrial Zone","lifecycle_state":"operating"}'::jsonb)
		RETURNING id
	),
	area AS (
		INSERT INTO asset (tag, name, class_code, parent_id, attributes)
		SELECT 'AREA-100', 'Utilities Area', 'AREA', id,
			'{"lifecycle_state":"operating"}'::jsonb FROM site
		RETURNING id
	),
	sys AS (
		INSERT INTO asset (tag, name, class_code, parent_id, attributes)
		SELECT 'SYS-110', 'Cooling Water System', 'SYSTEM', id,
			'{"lifecycle_state":"operating"}'::jsonb FROM area
		RETURNING id
	)
INSERT INTO asset (tag, name, class_code, attributes, parent_id)
SELECT v.tag, v.name, v.class_code, v.attributes::jsonb, sys.id
FROM sys, (VALUES
	(
		'P-101A', 'Cooling water pump A', 'PUMP-CENTRIFUGAL',
		'{"manufacturer":"Sulzer","model":"OHH-200","serial_no":"SN-AA-0001","location":"Pump house, bay 1","criticality":2,"lifecycle_state":"operating","commissioning_date":"2019-05-14","rated_flow_m3h":320,"rated_head_m":42,"rated_power_kw":55,"suction_pressure_bar":1.2,"discharge_pressure_bar":5.5,"fluid":"water","speed_rpm":2950,"npsh_required_m":3.2}'
	),
	(
		'P-101B', 'Cooling water pump B', 'PUMP-CENTRIFUGAL',
		'{"manufacturer":"Sulzer","model":"OHH-200","serial_no":"SN-AA-0002","location":"Pump house, bay 2","criticality":2,"lifecycle_state":"standby","commissioning_date":"2019-05-14","rated_flow_m3h":320,"rated_head_m":42,"rated_power_kw":55,"suction_pressure_bar":1.2,"discharge_pressure_bar":5.5,"fluid":"water","speed_rpm":2950,"npsh_required_m":3.2}'
	),
	(
		'P-220', 'Glycol dosing pump', 'PUMP-POSITIVE-DISPLACEMENT',
		'{"manufacturer":"Grundfos","model":"DDA 30-4","serial_no":"SN-AC-7781","location":"Dosing skid","criticality":3,"lifecycle_state":"operating","commissioning_date":"2021-09-03","rated_flow_m3h":0.03,"rated_head_m":40,"rated_power_kw":0.3,"fluid":"glycol 30%"}'
	),
	(
		'P-305', 'Sump drain pump', 'PUMP-SUBMERSIBLE',
		'{"manufacturer":"Xylem","model":"Flygt 3085","serial_no":"SN-AD-1204","location":"Sump pit 3","criticality":4,"lifecycle_state":"operating","commissioning_date":"2020-02-10","rated_flow_m3h":22,"rated_head_m":8,"rated_power_kw":1.1,"fluid":"oily water"}'
	)
) AS v(tag, name, class_code, attributes);

-- One example document attached to P-101A
INSERT INTO asset_document (asset_id, filename, stored_path, mime_type, size_bytes, description, uploaded_by)
SELECT id, 'P-101A_datasheet.pdf', 'example/P-101A_datasheet.pdf',
	'application/pdf', 123456, 'Manufacturer datasheet', 'seed'
FROM asset WHERE tag = 'P-101A';

COMMIT;