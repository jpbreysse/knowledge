-- NOTE: seeds bypass the asset write service (src/lib/server/asset-service.ts): no validation, no rules — fixtures only. Runtime writes must go through createAsset/updateAsset.
-- 012_dd_demo_dataset.sql — Lummus DD vertical demo (v3.1).
--
-- 4 engagements × 3 sponsors × 3 lenders × 3 external advisors × 2 physical
-- assets = 15 assets, plus one entity_link (spon-005 → engmt-004) that
-- demonstrates the cross-engagement retrieval story.
--
-- Also inserts the ENGAGEMENT class row (family PROJECT), placed here rather
-- than in migration 011 because class taxonomy edits belong with seed data
-- (same pattern used by seed 010 for the 17 LCI classes).
--
-- Coexistence: distinct tags from the Peru-pipeline seed (011):
--   engagements: engmt-001..004         (NEW)
--   sponsors:    spon-003..005          (existing spon-001..002 kept)
--   lenders:     lend-003..005          (existing lend-001..002 kept)
--   advisors:    extadv-002..004        (existing extadv-001 kept)
--   physical:    phys-002..003          (existing phys-001 kept)
--
-- Idempotent via ON CONFLICT (tag) DO UPDATE for assets and (code) for the
-- class row. Entity link uses ON CONFLICT (source, target, relation_type).
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed/012_dd_demo_dataset.sql

BEGIN;

-- ============================================================================
-- ENGAGEMENT class (family=PROJECT)
-- ============================================================================
INSERT INTO asset_class (
	code, label, family, id_prefix, color, confidentiality_default, description,
	attribute_fields, valid_lifecycle_states, applicable_tabs
)
VALUES (
	'ENGAGEMENT', 'Engagement', 'PROJECT', 'engmt-', '#4a7c8a', 'restricted',
	'A single DD/advisory mandate. Anchor entity for the DD demo vertical.',
	'[
		{"name":"engagement_type","label":"Engagement type","type":"select","required":true,"group":"Identity","options":[
			"Environmental & Decommissioning",
			"Lender''s Engineer",
			"M&A Technical DD",
			"Lender-Side Asset Valuation",
			"Construction Monitoring",
			"other"
		]},
		{"name":"mandate_start","label":"Mandate start","type":"text","group":"Schedule"},
		{"name":"mandate_end","label":"Mandate end","type":"text","group":"Schedule"},
		{"name":"status","label":"Status","type":"select","required":true,"group":"Status","options":[
			"in DD","delivered","on hold","closed-out"
		]}
	]'::jsonb,
	'[]'::jsonb,
	'["details","documents","history"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, id_prefix = EXCLUDED.id_prefix,
	color = EXCLUDED.color, confidentiality_default = EXCLUDED.confidentiality_default,
	description = EXCLUDED.description, attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states,
	applicable_tabs = EXCLUDED.applicable_tabs;

-- ============================================================================
-- 1. ENGAGEMENTS (4)
-- ============================================================================
INSERT INTO asset (tag, name, class_code, confidentiality, attributes, updated_by)
VALUES
	('engmt-001', 'Coastal Bay Refinery Decommissioning', 'ENGAGEMENT', 'restricted',
		'{"engagement_type":"Environmental & Decommissioning","mandate_start":"2025-11-10","status":"in DD"}'::jsonb,
		'seed'),
	('engmt-002', 'Northport LNG Greenfield Facility', 'ENGAGEMENT', 'restricted',
		'{"engagement_type":"Lender''s Engineer","mandate_start":"2025-08-01","status":"in DD"}'::jsonb,
		'seed'),
	('engmt-003', 'Meridian Gas Assets Acquisition DD', 'ENGAGEMENT', 'restricted',
		'{"engagement_type":"M&A Technical DD","mandate_start":"2026-01-15","mandate_end":"2026-04-30","status":"delivered"}'::jsonb,
		'seed'),
	('engmt-004', 'Sierra Pipeline Portfolio Valuation', 'ENGAGEMENT', 'restricted',
		'{"engagement_type":"Lender-Side Asset Valuation","mandate_start":"2026-03-01","status":"in DD"}'::jsonb,
		'seed')
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- ============================================================================
-- 2. SPONSORS (3)  — spon-005 parents to engmt-003 and cross-links to engmt-004
-- ============================================================================
INSERT INTO asset (tag, name, class_code, parent_id, confidentiality, attributes, updated_by)
SELECT * FROM (VALUES
	('spon-003', 'Coastal Bay Petroleum Corp', 'SPON',
		(SELECT id FROM asset WHERE tag = 'engmt-001'),
		'internal',
		jsonb_build_object(
			'sponsor_name','Coastal Bay Petroleum Corp',
			'sponsor_class','IOC',
			'headquarters','Houston, TX, USA',
			'prior_engagements',2,
			'engineering_capacity','deep'
		),
		'seed'),
	('spon-004', 'Northport LNG Consortium', 'SPON',
		(SELECT id FROM asset WHERE tag = 'engmt-002'),
		'internal',
		jsonb_build_object(
			'sponsor_name','Northport LNG Consortium',
			'sponsor_class','infrastructure fund',
			'headquarters','Vancouver, BC, Canada',
			'prior_engagements',1,
			'engineering_capacity','moderate'
		),
		'seed'),
	('spon-005', 'Meridian Energy Holdings', 'SPON',
		(SELECT id FROM asset WHERE tag = 'engmt-003'),
		'internal',
		jsonb_build_object(
			'sponsor_name','Meridian Energy Holdings',
			'sponsor_class','financial sponsor',
			'headquarters','New York, NY, USA',
			'prior_engagements',3,
			'engineering_capacity','thin'
		),
		'seed')
) AS v(tag, name, class_code, parent_id, confidentiality, attributes, updated_by)
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code, parent_id = EXCLUDED.parent_id,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- ============================================================================
-- 3. LENDERS (3)
-- ============================================================================
INSERT INTO asset (tag, name, class_code, parent_id, confidentiality, attributes, updated_by)
SELECT * FROM (VALUES
	('lend-003', 'Bank of North America — Project Finance', 'LEND',
		(SELECT id FROM asset WHERE tag = 'engmt-002'),
		'restricted',
		jsonb_build_object('lender_name','Bank of North America — Project Finance','lender_class','commercial bank','prior_engagements',6),
		'seed'),
	('lend-004', 'JBIC (Japan Bank for International Cooperation)', 'LEND',
		(SELECT id FROM asset WHERE tag = 'engmt-002'),
		'restricted',
		jsonb_build_object('lender_name','JBIC','lender_class','ECA','prior_engagements',3),
		'seed'),
	('lend-005', 'Sierra Regional Credit Fund', 'LEND',
		(SELECT id FROM asset WHERE tag = 'engmt-004'),
		'restricted',
		jsonb_build_object('lender_name','Sierra Regional Credit Fund','lender_class','private credit','prior_engagements',1),
		'seed')
) AS v(tag, name, class_code, parent_id, confidentiality, attributes, updated_by)
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code, parent_id = EXCLUDED.parent_id,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- ============================================================================
-- 4. EXTERNAL ADVISORS (3)
-- ============================================================================
INSERT INTO asset (tag, name, class_code, parent_id, confidentiality, attributes, updated_by)
SELECT * FROM (VALUES
	('extadv-002', 'Ramboll Environmental (Coastal Bay advisor)', 'EXTADV',
		(SELECT id FROM asset WHERE tag = 'engmt-001'),
		'internal',
		jsonb_build_object('firm_name','Ramboll Environmental','firm_type','ESG specialist','prior_interactions',4),
		'seed'),
	('extadv-003', 'Wood Group PLC (Northport LNG advisor)', 'EXTADV',
		(SELECT id FROM asset WHERE tag = 'engmt-002'),
		'internal',
		jsonb_build_object('firm_name','Wood Group PLC','firm_type','Engineering consultancy','prior_interactions',7),
		'seed'),
	('extadv-004', 'Mott MacDonald (Meridian DD advisor)', 'EXTADV',
		(SELECT id FROM asset WHERE tag = 'engmt-003'),
		'internal',
		jsonb_build_object('firm_name','Mott MacDonald','firm_type','Engineering consultancy','prior_interactions',2),
		'seed')
) AS v(tag, name, class_code, parent_id, confidentiality, attributes, updated_by)
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code, parent_id = EXCLUDED.parent_id,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- ============================================================================
-- 5. PHYSICAL ASSETS (2)
-- ============================================================================
INSERT INTO asset (tag, name, class_code, parent_id, confidentiality, attributes, updated_by)
SELECT 'phys-002', 'Coastal Bay Refinery (decommissioning)', 'PHYS',
	(SELECT id FROM asset WHERE tag = 'engmt-001'),
	'client-shareable',
	jsonb_build_object(
		'asset_class','refinery',
		'subtype','Legacy heavy-crude refinery',
		'jurisdiction','California, USA',
		'scale_value',180,
		'scale_unit','MW-thermal',
		'lifecycle_stage','decommissioned',
		'sponsor_ref',(SELECT id FROM asset WHERE tag = 'spon-003'),
		'operator','Coastal Bay Petroleum Corp',
		'permitting_status','in progress'
	),
	'seed'
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code, parent_id = EXCLUDED.parent_id,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

INSERT INTO asset (tag, name, class_code, parent_id, confidentiality, attributes, updated_by)
SELECT 'phys-003', 'Northport LNG Terminal (greenfield)', 'PHYS',
	(SELECT id FROM asset WHERE tag = 'engmt-002'),
	'client-shareable',
	jsonb_build_object(
		'asset_class','LNG terminal',
		'subtype','Greenfield mid-scale liquefaction',
		'jurisdiction','British Columbia, Canada',
		'scale_value',5.2,
		'scale_unit','MMTPA',
		'lifecycle_stage','under construction',
		'sponsor_ref',(SELECT id FROM asset WHERE tag = 'spon-004'),
		'epc_contractor','Fluor Corporation',
		'operator','Northport LNG Consortium',
		'permitting_status','complete'
	),
	'seed'
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code, parent_id = EXCLUDED.parent_id,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- ============================================================================
-- 6. ENTITY LINK — spon-005 participates_in engmt-004 (the cross-link that
--    makes the demo differentiator visible: Meridian sits on two mandates)
-- ============================================================================
INSERT INTO entity_link (source_id, target_id, relation_type, created_by)
SELECT
	(SELECT id FROM asset WHERE tag = 'spon-005'),
	(SELECT id FROM asset WHERE tag = 'engmt-004'),
	'participates_in',
	'seed'
ON CONFLICT (source_id, target_id, relation_type) DO NOTHING;

COMMIT;