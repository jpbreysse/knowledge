-- NOTE: seeds bypass the asset write service (src/lib/server/asset-service.ts): no validation, no rules — fixtures only. Runtime writes must go through createAsset/updateAsset.
-- 013_equipment_core_fields.sql — declare the previously-hardcoded core fields
-- (serial_no, manufacturer, model, location, criticality, lifecycle_state,
-- commissioning_date) inside the attribute schemas of the classes that actually
-- use them. Runs after seed 008.
--
-- Migration 013 moved these fields off the `asset` row into the `attributes`
-- JSONB. This seed makes them visible on the form for equipment and structural
-- classes, which is where they were previously always rendered.
--
-- Idempotent: filters any pre-existing core-field entries out of the class's
-- attribute_fields, then prepends a fresh copy. Re-runs produce the same shape.
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed/013_equipment_core_fields.sql

BEGIN;

-- --------------------------------------------------------------------------
-- Equipment classes get the full 7-field identity/status block.
-- --------------------------------------------------------------------------
UPDATE asset_class
SET attribute_fields = '[
	{"name":"manufacturer","label":"Manufacturer","type":"text","group":"Identity"},
	{"name":"model","label":"Model","type":"text","group":"Identity"},
	{"name":"serial_no","label":"Serial number","type":"text","group":"Identity"},
	{"name":"location","label":"Location","type":"text","group":"Identity"},
	{"name":"criticality","label":"Criticality (1–5)","type":"number","group":"Status"},
	{"name":"lifecycle_state","label":"Lifecycle state","type":"select","group":"Status","options":["planned","operating","standby","shutdown","decommissioned"]},
	{"name":"commissioning_date","label":"Commissioning date","type":"text","group":"Status"}
]'::jsonb || COALESCE(
	(SELECT jsonb_agg(f)
		FROM jsonb_array_elements(attribute_fields) f
		WHERE f->>'name' NOT IN (
			'manufacturer','model','serial_no','location',
			'criticality','lifecycle_state','commissioning_date'
		)),
	'[]'::jsonb
)
WHERE code IN (
	'PUMP-CENTRIFUGAL','PUMP-POSITIVE-DISPLACEMENT','PUMP-SUBMERSIBLE',
	'MOTOR-ELECTRIC','PIG-TRAP','METER-CORIOLIS'
);

-- --------------------------------------------------------------------------
-- Structural classes (SITE, AREA, SYSTEM) — location + lifecycle only.
-- --------------------------------------------------------------------------
UPDATE asset_class
SET attribute_fields = '[
	{"name":"location","label":"Location","type":"text","group":"Identity"},
	{"name":"lifecycle_state","label":"Lifecycle state","type":"select","group":"Status","options":["operating","shutdown","decommissioned"]}
]'::jsonb || COALESCE(
	(SELECT jsonb_agg(f)
		FROM jsonb_array_elements(attribute_fields) f
		WHERE f->>'name' NOT IN ('location','lifecycle_state')),
	'[]'::jsonb
)
WHERE code IN ('SITE','AREA','SYSTEM');

COMMIT;