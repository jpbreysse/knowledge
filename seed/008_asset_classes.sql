-- NOTE: seeds bypass the asset write service (src/lib/server/asset-service.ts): no validation, no rules — fixtures only. Runtime writes must go through createAsset/updateAsset.
-- 008_asset_classes.sql — backfill asset_class rows for every class code
-- currently in use across the codebase + seed data.
--
-- Colors mirror the values in src/routes/graph/+page.svelte (CLASS_FILL map).
-- Pump attribute_fields match src/lib/server/validation.ts PUMP_ATTR_KEYS.
-- Lender attribute_fields capture the LENDER-CONTEXT structure from seed 007.
--
-- This seed only populates METADATA. It does not change how the rest of the
-- app validates or renders — that wiring is a follow-up.
--
-- Idempotent: ON CONFLICT (code) DO UPDATE — re-running refreshes the schema.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed/008_asset_classes.sql

BEGIN;

-- Pumps
INSERT INTO asset_class (code, label, family, color, attribute_fields, valid_lifecycle_states, applicable_tabs, description)
VALUES (
	'PUMP-CENTRIFUGAL', 'Centrifugal pump', 'EQUIPMENT', '#8fcaa3',
	'[
		{"name":"rated_flow_m3h","label":"Rated flow","type":"number","unit":"m³/h","group":"Performance"},
		{"name":"rated_head_m","label":"Rated head","type":"number","unit":"m","group":"Performance"},
		{"name":"rated_power_kw","label":"Rated power","type":"number","unit":"kW","group":"Performance"},
		{"name":"speed_rpm","label":"Speed","type":"number","unit":"rpm","group":"Performance"},
		{"name":"suction_pressure_bar","label":"Suction pressure","type":"number","unit":"bar","group":"Process"},
		{"name":"discharge_pressure_bar","label":"Discharge pressure","type":"number","unit":"bar","group":"Process"},
		{"name":"npsh_required_m","label":"NPSHr","type":"number","unit":"m","group":"Process"},
		{"name":"fluid","label":"Fluid","type":"text","group":"Process"}
	]'::jsonb,
	'["operating","standby","shutdown","decommissioned"]'::jsonb,
	'["details","assessment","documents","history"]'::jsonb,
	'API 610 / ANSI centrifugal pump.'
),
(
	'PUMP-POSITIVE-DISPLACEMENT', 'Positive-displacement pump', 'EQUIPMENT', '#6aa8d8',
	'[
		{"name":"rated_flow_m3h","label":"Rated flow","type":"number","unit":"m³/h","group":"Performance"},
		{"name":"rated_head_m","label":"Rated head","type":"number","unit":"m","group":"Performance"},
		{"name":"rated_power_kw","label":"Rated power","type":"number","unit":"kW","group":"Performance"},
		{"name":"speed_rpm","label":"Speed","type":"number","unit":"rpm","group":"Performance"},
		{"name":"fluid","label":"Fluid","type":"text","group":"Process"}
	]'::jsonb,
	'["operating","standby","shutdown","decommissioned"]'::jsonb,
	'["details","assessment","documents","history"]'::jsonb,
	'Reciprocating, diaphragm, gear, or screw pump.'
),
(
	'PUMP-SUBMERSIBLE', 'Submersible pump', 'EQUIPMENT', '#7fc6bc',
	'[
		{"name":"rated_flow_m3h","label":"Rated flow","type":"number","unit":"m³/h","group":"Performance"},
		{"name":"rated_head_m","label":"Rated head","type":"number","unit":"m","group":"Performance"},
		{"name":"rated_power_kw","label":"Rated power","type":"number","unit":"kW","group":"Performance"},
		{"name":"fluid","label":"Fluid","type":"text","group":"Process"}
	]'::jsonb,
	'["operating","standby","shutdown","decommissioned"]'::jsonb,
	'["details","assessment","documents","history"]'::jsonb,
	'Submerged centrifugal pump (sump, borehole, ESP).'
)

ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, color = EXCLUDED.color,
	attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states,
	applicable_tabs = EXCLUDED.applicable_tabs,
	description = EXCLUDED.description;

-- Motor
INSERT INTO asset_class (code, label, family, color, attribute_fields, valid_lifecycle_states, applicable_tabs, description)
VALUES (
	'MOTOR-ELECTRIC', 'Electric motor', 'EQUIPMENT', '#d4a8e0',
	'[
		{"name":"rated_power_kw","label":"Rated power","type":"number","unit":"kW","group":"Electrical"},
		{"name":"rated_voltage_v","label":"Rated voltage","type":"number","unit":"V","group":"Electrical"},
		{"name":"frequency_hz","label":"Frequency","type":"number","unit":"Hz","group":"Electrical"},
		{"name":"speed_rpm","label":"Speed","type":"number","unit":"rpm","group":"Mechanical"},
		{"name":"enclosure","label":"Enclosure","type":"text","group":"Construction"},
		{"name":"insulation_class","label":"Insulation class","type":"text","group":"Construction"},
		{"name":"cooling","label":"Cooling","type":"text","group":"Construction"}
	]'::jsonb,
	'["operating","standby","shutdown","decommissioned"]'::jsonb,
	'["details","assessment","documents","history"]'::jsonb,
	'AC induction motor, MV or LV.'
)
ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, color = EXCLUDED.color,
	attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states,
	applicable_tabs = EXCLUDED.applicable_tabs,
	description = EXCLUDED.description;

-- Pig trap
INSERT INTO asset_class (code, label, family, color, attribute_fields, valid_lifecycle_states, applicable_tabs, description)
VALUES (
	'PIG-TRAP', 'Pig trap (launcher / receiver)', 'EQUIPMENT', '#e8c79a',
	'[
		{"name":"nominal_diameter_in","label":"Nominal diameter","type":"number","unit":"in","group":"Mechanical"},
		{"name":"design_pressure_bar","label":"Design pressure","type":"number","unit":"bar","group":"Mechanical"},
		{"name":"material","label":"Material","type":"text","group":"Mechanical"},
		{"name":"type","label":"Type","type":"text","group":"Mechanical"}
	]'::jsonb,
	'["operating","standby","shutdown","decommissioned"]'::jsonb,
	'["details","assessment","documents","history"]'::jsonb,
	'Pipeline pig launcher or receiver.'
)
ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, color = EXCLUDED.color,
	attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states,
	applicable_tabs = EXCLUDED.applicable_tabs,
	description = EXCLUDED.description;

-- Coriolis meter
INSERT INTO asset_class (code, label, family, color, attribute_fields, valid_lifecycle_states, applicable_tabs, description)
VALUES (
	'METER-CORIOLIS', 'Coriolis meter', 'EQUIPMENT', '#b8d4ea',
	'[
		{"name":"nominal_diameter_in","label":"Nominal diameter","type":"number","unit":"in","group":"Process"},
		{"name":"flow_range_m3h","label":"Flow range","type":"text","unit":"m³/h","group":"Process"},
		{"name":"accuracy_class","label":"Accuracy class","type":"text","group":"Metrology"},
		{"name":"custody_transfer_certified","label":"Custody-transfer certified","type":"boolean","group":"Metrology"},
		{"name":"applicable_standards","label":"Applicable standards","type":"list","group":"Metrology"}
	]'::jsonb,
	'["operating","standby","shutdown","decommissioned"]'::jsonb,
	'["details","assessment","documents","history"]'::jsonb,
	'Mass-flow meter using the Coriolis effect.'
)
ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, color = EXCLUDED.color,
	attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states,
	applicable_tabs = EXCLUDED.applicable_tabs,
	description = EXCLUDED.description;

-- Structural: SITE / AREA / SYSTEM
INSERT INTO asset_class (code, label, family, color, attribute_fields, valid_lifecycle_states, applicable_tabs, description)
VALUES
	('SITE',   'Site',   'STRUCTURAL', '#c8d6e5', '[]'::jsonb, '["operating","shutdown","decommissioned"]'::jsonb, '["details","documents","history"]'::jsonb, 'Top-level location.'),
	('AREA',   'Area',   'STRUCTURAL', '#d9dde3', '[]'::jsonb, '["operating","shutdown","decommissioned"]'::jsonb, '["details","documents","history"]'::jsonb, 'Subdivision of a site.'),
	('SYSTEM', 'System', 'STRUCTURAL', '#e4eaf1', '[]'::jsonb, '["operating","shutdown","decommissioned"]'::jsonb, '["details","documents","history"]'::jsonb, 'Functional grouping of equipment.')
ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, color = EXCLUDED.color,
	attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states,
	applicable_tabs = EXCLUDED.applicable_tabs,
	description = EXCLUDED.description;

-- Lender context (relationship asset)
INSERT INTO asset_class (code, label, family, color, attribute_fields, valid_lifecycle_states, applicable_tabs, description)
VALUES (
	'LENDER-CONTEXT', 'Lender context', 'RELATIONSHIP', '#f0d4a8',
	'[
		{"name":"type_label","label":"Type","type":"text","group":"Identity"},
		{"name":"lender_class","label":"Lender class","type":"text","group":"Identity"},
		{"name":"sector_focus","label":"Sector focus","type":"text","group":"Identity"},
		{"name":"owner","label":"Relationship owner","type":"text","group":"Identity"},
		{"name":"recurring_team","label":"Recurring team","type":"list","group":"People"},
		{"name":"push_patterns","label":"Push patterns","type":"object","group":"Behaviour"},
		{"name":"escalation_history","label":"Escalation history","type":"object","group":"Behaviour"},
		{"name":"last_interaction","label":"Last interaction","type":"text","group":"Cadence"},
		{"name":"confidentiality","label":"Confidentiality","type":"text","group":"Governance"}
	]'::jsonb,
	'[]'::jsonb,
	'["details","documents","history"]'::jsonb,
	'Lender-side context for project-finance relationships. Tracks team, behaviour, escalation history.'
)
ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, color = EXCLUDED.color,
	attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states,
	applicable_tabs = EXCLUDED.applicable_tabs,
	description = EXCLUDED.description;

-- Catch-all
INSERT INTO asset_class (code, label, family, color, attribute_fields, valid_lifecycle_states, applicable_tabs, description)
VALUES (
	'OTHER', 'Other', 'OTHER', '#d4d4d4',
	'[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
	'Catch-all when no more specific class applies.'
)
ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, color = EXCLUDED.color,
	attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states,
	applicable_tabs = EXCLUDED.applicable_tabs,
	description = EXCLUDED.description;

COMMIT;