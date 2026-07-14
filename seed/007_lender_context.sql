-- NOTE: seeds bypass the asset write service (src/lib/server/asset-service.ts): no validation, no rules — fixtures only. Runtime writes must go through createAsset/updateAsset.
-- 007_lender_context.sql — IDB Invest lender-context asset.
--
-- A non-equipment asset type: tracks a lender relationship (team, push
-- patterns, escalation history). Everything lender-specific lives in
-- attributes JSONB so the quick prototype needs no further schema work.
--
-- The class_code 'LENDER-CONTEXT' is unlocked by migration 007.
--
-- v3.1: 'location', 'criticality', 'commissioning_date' live inside attributes
-- since migration 013 moved them off the asset row.
--
-- Idempotent: ON CONFLICT (tag) DO UPDATE — re-running refreshes the JSON.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed/007_lender_context.sql

BEGIN;

INSERT INTO asset (tag, name, class_code, attributes, updated_by)
VALUES (
	'lender-ctx-001',
	'IDB Invest',
	'LENDER-CONTEXT',
	'{
		"location":"Washington DC, USA",
		"criticality":4,
		"commissioning_date":"2020-03-01",
		"type_label":"Layer 1 — Lender Context Asset",
		"lender_class":"Multilateral Development Bank",
		"sector_focus":"LatAm infrastructure, energy, ESG-led",
		"recurring_team":[
			{"name":"M. Hidalgo","role":"Senior Credit Officer","prior_deals":4},
			{"name":"C. Vargas","role":"Technical Advisor","prior_deals":3}
		],
		"push_patterns":{
			"environmental_and_social":"HIGH",
			"indigenous_consultation_LatAm":"HIGH (especially Peru/Bolivia)",
			"completion_testing_protocols":"MEDIUM",
			"financial_model_assumptions":"LOW"
		},
		"escalation_history":{
			"count":1,
			"notes":"Colombia 2023 — resolved via hydrostatic testing gate"
		},
		"last_interaction":"2026-04-12",
		"confidentiality":"Internal — no client-shared exports",
		"owner":"Senior Partner (relationship lead)"
	}'::jsonb,
	'seed'
)
ON CONFLICT (tag) DO UPDATE SET
	name       = EXCLUDED.name,
	class_code = EXCLUDED.class_code,
	attributes = EXCLUDED.attributes,
	updated_by = EXCLUDED.updated_by;

COMMIT;