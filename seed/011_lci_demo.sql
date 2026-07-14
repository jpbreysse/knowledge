-- NOTE: seeds bypass the asset write service (src/lib/server/asset-service.ts): no validation, no rules — fixtures only. Runtime writes must go through createAsset/updateAsset.
-- 011_lci_demo.sql — credible LCI demo mini-portfolio.
--
-- Inserts (in FK dependency order from the upload spec):
--   3 engineers (eng-)
--   2 sponsors  (spon-)
--   1 external advisor (extadv-)
--   2 lenders  (lend-)
--   1 physical asset (phys-)
--   1 transaction (tx-)
--   2 IER versions (ier-) — v0.3-draft → v1.0-final, demonstrating P5
--
-- Refs are resolved via subqueries on `tag` so the file is readable and the
-- ON CONFLICT (tag) DO UPDATE makes re-runs idempotent (refs always resolve
-- to the same UUIDs).
--
-- Coexistence: this seed only inserts LCI-shaped assets (LAYER-1/2/3).
-- It does not modify or delete any Lummus seed rows.
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed/011_lci_demo.sql

BEGIN;

-- 1. Engineers ---------------------------------------------------------------
INSERT INTO asset (tag, name, class_code, confidentiality, attributes, updated_by)
VALUES
	('eng-001', 'J. Müller', 'ENG', 'internal',
		'{"role":"project manager","seniority":"partner","expertise_tags":["project finance","pipeline","LatAm"],"asset_class_experience":["Pipeline","midstream"],"jurisdiction_experience":["Peru","Colombia","Mexico"],"availability_pct":40,"start_date":"2014-09-01"}'::jsonb,
		'seed'),
	('eng-002', 'P. Aramburu', 'ENG', 'internal',
		'{"role":"technical specialist","seniority":"senior","expertise_tags":["pipeline IE","corrosion","welding","Peru"],"asset_class_experience":["Pipeline","midstream"],"jurisdiction_experience":["Peru","Bolivia"],"availability_pct":70,"start_date":"2018-03-15"}'::jsonb,
		'seed'),
	('eng-003', 'A. Lefevre', 'ENG', 'internal',
		'{"role":"partner","seniority":"partner","expertise_tags":["LNG","commercial","negotiation"],"asset_class_experience":["LNG terminal","power plant"],"jurisdiction_experience":["Brazil","Argentina","Chile"],"availability_pct":25,"start_date":"2009-01-12"}'::jsonb,
		'seed')
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- 2. Sponsors ----------------------------------------------------------------
INSERT INTO asset (tag, name, class_code, confidentiality, attributes, updated_by)
SELECT 'spon-001', 'Andes Midstream Holdings', 'SPON', 'internal',
	jsonb_build_object(
		'sponsor_name', 'Andes Midstream Holdings',
		'sponsor_class', 'infrastructure fund',
		'headquarters', 'Lima, Peru',
		'prior_engagements', 4,
		'engineering_capacity', 'moderate',
		'push_patterns', 'Frequently asks for early access to draft sections; receptive when given a clear delivery schedule.',
		'track_record_notes', 'On-time delivery on 3 of 4 prior projects. Cost-overruns ~8% above budget on average.',
		'last_interaction', '2026-04-22',
		'owner_ref', (SELECT id FROM asset WHERE tag = 'eng-001')
	),
	'seed'
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

INSERT INTO asset (tag, name, class_code, confidentiality, attributes, updated_by)
SELECT 'spon-002', 'Coastal Power International', 'SPON', 'internal',
	jsonb_build_object(
		'sponsor_name', 'Coastal Power International',
		'sponsor_class', 'Independent',
		'headquarters', 'São Paulo, Brazil',
		'prior_engagements', 1,
		'engineering_capacity', 'thin',
		'push_patterns', 'Limited in-house engineering — heavy reliance on EPC documentation. Responsive to direct RFIs.',
		'last_interaction', '2026-02-10',
		'owner_ref', (SELECT id FROM asset WHERE tag = 'eng-003')
	),
	'seed'
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- 3. External advisor --------------------------------------------------------
INSERT INTO asset (tag, name, class_code, confidentiality, attributes, updated_by)
VALUES
	('extadv-001', 'Worley Parsons (Brazil office)', 'EXTADV', 'internal',
		'{"firm_name":"Worley Parsons (Brazil office)","firm_type":"Engineering consultancy","focus_patterns":"Strong on permitting and environmental approval. Less rigorous on completion testing details.","prior_interactions":3}'::jsonb,
		'seed')
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- 4. Lenders -----------------------------------------------------------------
INSERT INTO asset (tag, name, class_code, confidentiality, attributes, updated_by)
SELECT 'lend-001', 'IDB Invest', 'LEND', 'restricted',
	jsonb_build_object(
		'lender_name', 'IDB Invest',
		'lender_class', 'MDB',
		'sector_focus', ARRAY['LatAm infrastructure', 'energy', 'ESG-led'],
		'push_patterns_json', jsonb_build_object(
			'environmental_and_social', 'HIGH',
			'indigenous_consultation_LatAm', 'HIGH (especially Peru/Bolivia)',
			'completion_testing_protocols', 'MEDIUM',
			'financial_model_assumptions', 'LOW'
		),
		'escalation_history', 'Colombia 2023 — resolved via hydrostatic testing gate. 1 escalation total.',
		'prior_engagements', 5,
		'last_interaction', '2026-04-12',
		'owner_ref', (SELECT id FROM asset WHERE tag = 'eng-001')
	),
	'seed'
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

INSERT INTO asset (tag, name, class_code, confidentiality, attributes, updated_by)
SELECT 'lend-002', 'Citi Project Finance Group', 'LEND', 'restricted',
	jsonb_build_object(
		'lender_name', 'Citi Project Finance Group',
		'lender_class', 'commercial bank',
		'sector_focus', ARRAY['LatAm midstream', 'power'],
		'push_patterns_json', jsonb_build_object(
			'financial_model_assumptions', 'HIGH',
			'cash_sweep_mechanics', 'HIGH',
			'completion_testing_protocols', 'MEDIUM',
			'environmental_and_social', 'MEDIUM'
		),
		'prior_engagements', 2,
		'last_interaction', '2026-03-30',
		'owner_ref', (SELECT id FROM asset WHERE tag = 'eng-002')
	),
	'seed'
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- 5. Physical asset ----------------------------------------------------------
INSERT INTO asset (tag, name, class_code, confidentiality, attributes, updated_by)
SELECT 'phys-001', 'Peru southern gas pipeline 280km', 'PHYS', 'client-shareable',
	jsonb_build_object(
		'asset_class', 'Pipeline',
		'subtype', 'Greenfield midstream gas pipeline',
		'jurisdiction', 'Peru — southern, Cusco basin',
		'scale_value', 280,
		'scale_unit', 'km',
		'lifecycle_stage', 'under construction',
		'sponsor_ref', (SELECT id FROM asset WHERE tag = 'spon-001'),
		'epc_contractor', 'Técnicas Reunidas',
		'operator', 'Andes Midstream Holdings',
		'permitting_status', 'complete'
	),
	'seed'
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- 6. Transaction -------------------------------------------------------------
INSERT INTO asset (tag, name, class_code, confidentiality, attributes, updated_by)
SELECT 'tx-001', 'Peru pipeline 2026 project finance', 'TX', 'restricted',
	jsonb_build_object(
		'physical_asset_ref', (SELECT id FROM asset WHERE tag = 'phys-001'),
		'transaction_type', 'Initial project finance',
		'debt_amount_usd_m', 720,
		'debt_tenor_years', 15,
		'equity_amount_usd_m', 280,
		'syndicate_lead_ref', (SELECT id FROM asset WHERE tag = 'lend-001'),
		'syndicate_members', jsonb_build_array(
			(SELECT id FROM asset WHERE tag = 'lend-001'),
			(SELECT id FROM asset WHERE tag = 'lend-002')
		),
		'financial_close_date', '2026-08-15',
		'status', 'in DD',
		'sponsor_ref', (SELECT id FROM asset WHERE tag = 'spon-001')
	),
	'seed'
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

-- 7. IER v0.3-draft (the older version) -------------------------------------
INSERT INTO asset (tag, name, class_code, confidentiality, version, attributes, updated_by)
SELECT 'ier-001', 'Peru pipeline IER', 'IER', 'restricted', 'v0.3-draft',
	jsonb_build_object(
		'engagement_ref', 'eng-event-2026-peru-pipeline',
		'transaction_ref', (SELECT id FROM asset WHERE tag = 'tx-001'),
		'status', 'in review',
		'delivery_date', '2026-05-08',
		'document_storage_uri', 'http://localhost:3001/api/docs/ier-peru-pipeline-v0.3'
	),
	'seed'
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, version = EXCLUDED.version,
	attributes = EXCLUDED.attributes, updated_by = EXCLUDED.updated_by;

-- 8. IER v1.0-final (supersedes ier-001) ------------------------------------
INSERT INTO asset (tag, name, class_code, confidentiality, version, supersedes_asset_id, attributes, updated_by)
SELECT 'ier-002', 'Peru pipeline IER', 'IER', 'client-shareable', 'v1.0-final',
	(SELECT id FROM asset WHERE tag = 'ier-001'),
	jsonb_build_object(
		'engagement_ref', 'eng-event-2026-peru-pipeline',
		'transaction_ref', (SELECT id FROM asset WHERE tag = 'tx-001'),
		'status', 'signed-off',
		'delivery_date', '2026-08-01',
		'sign_off_lender_ref', (SELECT id FROM asset WHERE tag = 'lend-001'),
		'document_storage_uri', 'http://localhost:3001/api/docs/ier-peru-pipeline-v1.0'
	),
	'seed'
ON CONFLICT (tag) DO UPDATE SET
	name = EXCLUDED.name, class_code = EXCLUDED.class_code,
	confidentiality = EXCLUDED.confidentiality, version = EXCLUDED.version,
	supersedes_asset_id = EXCLUDED.supersedes_asset_id,
	attributes = EXCLUDED.attributes, updated_by = EXCLUDED.updated_by;

COMMIT;