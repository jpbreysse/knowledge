-- NOTE: seeds bypass the asset write service (src/lib/server/asset-service.ts): no validation, no rules — fixtures only. Runtime writes must go through createAsset/updateAsset.
-- 010_lci_classes.sql — seed all 17 LCI Independent-Engineer classes.
--
-- Per the user-supplied Asset_Definitions.docx spec: a three-layer ontology
-- for project-finance Independent Engineer work.
--   LAYER-3: Client assets — tangible things the firm performs DD on, plus
--            the deliverables produced.
--   LAYER-1: Company assets — externalised firm knowledge / relationship
--            intelligence. Reusable across engagements.
--   LAYER-2: Engineer assets — individual people at the firm, their
--            history with counterparties.
--
-- Coexistence: this seed does NOT touch the existing Lummus-industrial
-- classes (PUMP-*, MOTOR-*, etc.) or the existing LENDER-CONTEXT (which
-- carries the IDB Invest demo row). The new LCI lender class is `LEND`
-- (family LAYER-1) and is a separate, richer class.
--
-- engagement_ref + finding_ref fields use `text` for now (engagements live in
-- a separate app, findings in the Knowledge app). Promote to ref when those
-- apps share the DB.
--
-- Idempotent via ON CONFLICT (code) DO UPDATE. Re-running refreshes schemas.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed/010_lci_classes.sql

BEGIN;

-- =================================================================
-- LAYER 3 — CLIENT ASSETS
-- =================================================================

INSERT INTO asset_class (code, label, family, id_prefix, color, confidentiality_default, description, attribute_fields, valid_lifecycle_states, applicable_tabs)
VALUES (
	'PHYS', 'Physical asset under DD', 'LAYER-3', 'phys-', '#6b9bb4', 'client-shareable',
	'The tangible asset being evaluated by the firm.',
	'[
		{"name":"asset_class","label":"Asset class","type":"select","required":true,"group":"Identity","options":["Pipeline","LNG terminal","refinery","power plant","midstream","storage","transmission","other"]},
		{"name":"subtype","label":"Subtype","type":"text","group":"Identity"},
		{"name":"jurisdiction","label":"Jurisdiction","type":"text","required":true,"group":"Identity"},
		{"name":"scale_value","label":"Scale","type":"number","required":true,"group":"Scale"},
		{"name":"scale_unit","label":"Scale unit","type":"select","required":true,"group":"Scale","options":["km","MW","bcf/d","MMTPA","m3","MW-thermal","other"]},
		{"name":"lifecycle_stage","label":"Lifecycle stage","type":"select","required":true,"group":"Status","options":["Pre-construction","under construction","commissioning","operating","refinancing","decommissioned"]},
		{"name":"sponsor_ref","label":"Sponsor","type":"ref","required":true,"group":"Parties","asset_class_filter":"SPON"},
		{"name":"epc_contractor","label":"EPC contractor","type":"text","group":"Parties"},
		{"name":"operator","label":"Operator","type":"text","group":"Parties"},
		{"name":"permitting_status","label":"Permitting status","type":"select","group":"Status","options":["Not started","in progress","complete","contested"]}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'TX', 'Transaction', 'LAYER-3', 'tx-', '#4a7c8a', 'restricted',
	'The financing event — distinct from the physical asset.',
	'[
		{"name":"physical_asset_ref","label":"Physical asset","type":"ref","required":true,"group":"Subject","asset_class_filter":"PHYS"},
		{"name":"transaction_type","label":"Transaction type","type":"select","required":true,"group":"Deal","options":["Initial project finance","refinancing","expansion finance","M&A","restructuring"]},
		{"name":"debt_amount_usd_m","label":"Debt amount","type":"number","required":true,"unit":"USD M","group":"Deal"},
		{"name":"debt_tenor_years","label":"Debt tenor","type":"number","unit":"years","group":"Deal"},
		{"name":"equity_amount_usd_m","label":"Equity amount","type":"number","unit":"USD M","group":"Deal"},
		{"name":"syndicate_lead_ref","label":"Syndicate lead","type":"ref","required":true,"group":"Lenders","asset_class_filter":"LEND"},
		{"name":"syndicate_members","label":"Syndicate members","type":"array_ref","required":true,"group":"Lenders","asset_class_filter":"LEND"},
		{"name":"financial_close_date","label":"Financial close date","type":"text","group":"Schedule"},
		{"name":"status","label":"Status","type":"select","required":true,"group":"Schedule","options":["Pre-mandate","in DD","pre-close","closed","in construction monitoring","closed-out"]},
		{"name":"sponsor_ref","label":"Sponsor","type":"ref","required":true,"group":"Parties","asset_class_filter":"SPON"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'IER', 'Independent Engineer''s Report', 'LAYER-3', 'ier-', '#5b8c5a', 'restricted',
	'The primary written deliverable of pre-close due diligence.',
	'[
		{"name":"engagement_ref","label":"Engagement ref","type":"text","required":true,"group":"Context"},
		{"name":"transaction_ref","label":"Transaction","type":"ref","required":true,"group":"Context","asset_class_filter":"TX"},
		{"name":"status","label":"Status","type":"select","required":true,"group":"Status","options":["Drafting","in review","in revision","signed-off","archived"]},
		{"name":"delivery_date","label":"Delivery date","type":"text","group":"Schedule"},
		{"name":"sign_off_lender_ref","label":"Sign-off lender","type":"ref","group":"Approval","asset_class_filter":"LEND"},
		{"name":"document_storage_uri","label":"Document storage URI","type":"text","group":"Storage"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'CMR', 'Construction monitoring report', 'LAYER-3', 'cmr-', '#7da876', 'client-shareable',
	'Recurring post-close deliverable during construction phase.',
	'[
		{"name":"engagement_ref","label":"Engagement ref","type":"text","required":true,"group":"Context"},
		{"name":"period_start","label":"Period start","type":"text","required":true,"group":"Period"},
		{"name":"period_end","label":"Period end","type":"text","required":true,"group":"Period"},
		{"name":"period_number","label":"Period #","type":"number","required":true,"group":"Period"},
		{"name":"status","label":"Status","type":"select","required":true,"group":"Status","options":["In preparation","delivered","accepted","contested"]},
		{"name":"delivery_date","label":"Delivery date","type":"text","group":"Schedule"},
		{"name":"progress_pct","label":"Progress","type":"number","unit":"%","group":"Metrics"},
		{"name":"cost_variance_pct","label":"Cost variance","type":"number","unit":"%","group":"Metrics"},
		{"name":"schedule_variance_d","label":"Schedule variance","type":"number","unit":"days","group":"Metrics"},
		{"name":"document_storage_uri","label":"Document storage URI","type":"text","group":"Storage"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, id_prefix = EXCLUDED.id_prefix,
	color = EXCLUDED.color, confidentiality_default = EXCLUDED.confidentiality_default,
	description = EXCLUDED.description, attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states, applicable_tabs = EXCLUDED.applicable_tabs;

-- =================================================================
-- LAYER 1 — COMPANY ASSETS
-- =================================================================

INSERT INTO asset_class (code, label, family, id_prefix, color, confidentiality_default, description, attribute_fields, valid_lifecycle_states, applicable_tabs)
VALUES (
	'METH', 'Methodology', 'LAYER-1', 'meth-', '#b8a872', 'internal',
	'Codified, reusable approach to a recurring analysis type. New version = new record; supersedes the prior via supersedes_asset_id.',
	'[
		{"name":"version","label":"Version","type":"text","required":true,"group":"Identity"},
		{"name":"category","label":"Category","type":"select","required":true,"group":"Identity","options":["Technical methodology","process methodology","scoping framework","checklist","template"]},
		{"name":"asset_class_scope","label":"Asset class scope","type":"list","required":true,"group":"Scope"},
		{"name":"engagement_type","label":"Engagement type","type":"list","required":true,"group":"Scope"},
		{"name":"owner_ref","label":"Owner","type":"ref","required":true,"group":"Ownership","asset_class_filter":"ENG"},
		{"name":"last_used_at","label":"Last used","type":"text","group":"Usage"},
		{"name":"adoption_count","label":"Adoption count","type":"number","group":"Usage"},
		{"name":"status","label":"Status","type":"select","required":true,"group":"Status","options":["Active","deprecated","draft"]},
		{"name":"document_storage_uri","label":"Document storage URI","type":"text","group":"Storage"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'SPON', 'Sponsor-context', 'LAYER-1', 'spon-', '#c89968', 'internal',
	'Externalised relationship intelligence for a sponsor counterparty.',
	'[
		{"name":"sponsor_name","label":"Sponsor name","type":"text","required":true,"group":"Identity"},
		{"name":"sponsor_class","label":"Sponsor class","type":"select","required":true,"group":"Identity","options":["Independent","IOC","NOC","financial sponsor","infrastructure fund","utility","other"]},
		{"name":"headquarters","label":"Headquarters","type":"text","group":"Identity"},
		{"name":"prior_engagements","label":"Prior engagements","type":"number","group":"History"},
		{"name":"engineering_capacity","label":"Engineering capacity","type":"select","group":"Capability","options":["Thin","moderate","deep"]},
		{"name":"key_contacts","label":"Key contacts","type":"array_ref","group":"People","asset_class_filter":"INDIV"},
		{"name":"push_patterns","label":"Push patterns","type":"text","group":"Behaviour"},
		{"name":"track_record_notes","label":"Track record","type":"text","group":"Behaviour"},
		{"name":"last_interaction","label":"Last interaction","type":"text","group":"Cadence"},
		{"name":"owner_ref","label":"Relationship lead","type":"ref","required":true,"group":"Ownership","asset_class_filter":"ENG"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'LEND', 'Lender-context (project finance)', 'LAYER-1', 'lend-', '#d4a574', 'restricted',
	'Externalised relationship intelligence for a project-finance lender counterparty. Distinct from the legacy LENDER-CONTEXT class — use this one for new LCI data.',
	'[
		{"name":"lender_name","label":"Lender name","type":"text","required":true,"group":"Identity"},
		{"name":"lender_class","label":"Lender class","type":"select","required":true,"group":"Identity","options":["MDB","ECA","commercial bank","private credit","infrastructure fund","other"]},
		{"name":"sector_focus","label":"Sector focus","type":"list","group":"Identity"},
		{"name":"recurring_team","label":"Recurring team","type":"array_ref","group":"People","asset_class_filter":"INDIV"},
		{"name":"push_patterns_json","label":"Push patterns","type":"object","group":"Behaviour"},
		{"name":"playbook_ref","label":"Playbook","type":"ref","group":"Process","asset_class_filter":"PLAY"},
		{"name":"escalation_history","label":"Escalation history","type":"text","group":"Behaviour"},
		{"name":"prior_engagements","label":"Prior engagements","type":"number","group":"History"},
		{"name":"last_interaction","label":"Last interaction","type":"text","group":"Cadence"},
		{"name":"owner_ref","label":"Relationship lead","type":"ref","required":true,"group":"Ownership","asset_class_filter":"ENG"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'PLAY', 'Lender-playbook', 'LAYER-1', 'play-', '#d8b88c', 'restricted',
	'The explicit, structured review checklist or framework a lender brings.',
	'[
		{"name":"lender_ref","label":"Lender","type":"ref","required":true,"group":"Context","asset_class_filter":"LEND"},
		{"name":"playbook_type","label":"Playbook type","type":"select","required":true,"group":"Identity","options":["Completion testing","ESG","financial model","construction monitoring","technical DD checklist","other"]},
		{"name":"version","label":"Version","type":"text","required":true,"group":"Identity"},
		{"name":"last_seen_at","label":"Last seen","type":"text","required":true,"group":"Usage"},
		{"name":"sections","label":"Sections","type":"text","group":"Content"},
		{"name":"firm_deviation_notes","label":"Firm deviation notes","type":"text","group":"Content"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'EXTADV', 'External advisor', 'LAYER-1', 'extadv-', '#c2a878', 'internal',
	'Third-party technical advisors hired by lenders — often competing firms.',
	'[
		{"name":"firm_name","label":"Firm name","type":"text","required":true,"group":"Identity"},
		{"name":"firm_type","label":"Firm type","type":"select","required":true,"group":"Identity","options":["Engineering consultancy","financial advisor","technical advisor","ESG specialist","other"]},
		{"name":"typically_hired_by","label":"Typically hired by","type":"array_ref","group":"Relationships","asset_class_filter":"LEND"},
		{"name":"recurring_individuals","label":"Recurring individuals","type":"array_ref","group":"People","asset_class_filter":"INDIV"},
		{"name":"focus_patterns","label":"Focus patterns","type":"text","group":"Behaviour"},
		{"name":"prior_interactions","label":"Prior interactions","type":"number","group":"History"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'INDIV', 'Counterparty individual', 'LAYER-1', 'indiv-', '#b89878', 'restricted',
	'Individual person at a counterparty institution (lender, sponsor, or external advisor). Sensitive: behavioural observations only — no value judgements.',
	'[
		{"name":"institution_ref","label":"Institution","type":"ref","required":true,"group":"Identity","asset_class_filter":["LEND","SPON","EXTADV","LENDER-CONTEXT"]},
		{"name":"role","label":"Role","type":"text","required":true,"group":"Identity"},
		{"name":"seniority","label":"Seniority","type":"select","group":"Identity","options":["Junior","mid","senior","executive"]},
		{"name":"interaction_style","label":"Interaction style","type":"text","group":"Behaviour"},
		{"name":"push_patterns","label":"Push patterns","type":"text","group":"Behaviour"},
		{"name":"prior_engagements","label":"Prior engagements","type":"number","group":"History"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'COMP', 'Pricing / scope comparable', 'LAYER-1', 'comp-', '#a09060', 'internal',
	'Indexed retrieval set of past engagements made comparable for pricing and scope estimation.',
	'[
		{"name":"engagement_ref","label":"Engagement ref","type":"text","required":true,"group":"Source"},
		{"name":"physical_asset_ref","label":"Physical asset","type":"ref","required":true,"group":"Source","asset_class_filter":"PHYS"},
		{"name":"asset_class_tag","label":"Asset class","type":"select","required":true,"group":"Match keys","options":["Pipeline","LNG terminal","refinery","power plant","midstream","storage","transmission","other"]},
		{"name":"jurisdiction_tag","label":"Jurisdiction","type":"text","required":true,"group":"Match keys"},
		{"name":"scale_band","label":"Scale band","type":"select","required":true,"group":"Match keys","options":["small (<100km)","medium (100-300km)","large (300-600km)","mega (>600km)"]},
		{"name":"epc_contractor_tag","label":"EPC contractor","type":"text","group":"Match keys"},
		{"name":"sponsor_class_tag","label":"Sponsor class","type":"select","group":"Match keys","options":["Independent","IOC","NOC","financial sponsor","infrastructure fund","utility","other"]},
		{"name":"budgeted_hours","label":"Budgeted hours","type":"number","group":"Effort"},
		{"name":"actual_hours","label":"Actual hours","type":"number","group":"Effort"},
		{"name":"pricing_usd","label":"Pricing","type":"number","unit":"USD","group":"Effort"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'COMM', 'Commitment ledger', 'LAYER-1', 'comm-', '#9d8868', 'restricted',
	'Running log of commitments made during an engagement.',
	'[
		{"name":"engagement_ref","label":"Engagement ref","type":"text","required":true,"group":"Context"},
		{"name":"committed_by","label":"Committed by","type":"ref","required":true,"group":"Parties","asset_class_filter":["ENG","INDIV"]},
		{"name":"committed_to","label":"Committed to","type":"ref","required":true,"group":"Parties","asset_class_filter":["ENG","INDIV"]},
		{"name":"commitment_text","label":"Commitment","type":"text","required":true,"group":"Content"},
		{"name":"due_date","label":"Due date","type":"text","group":"Status"},
		{"name":"status","label":"Status","type":"select","required":true,"group":"Status","options":["Open","fulfilled","slipped","voided"]},
		{"name":"resolved_at","label":"Resolved at","type":"text","group":"Status"},
		{"name":"resolution_finding","label":"Resolution finding (ext ref)","type":"text","group":"Outcome"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'RFI', 'RFI / document-request log', 'LAYER-1', 'rfi-', '#b89868', 'restricted',
	'Structured tracking of every document request and delivery.',
	'[
		{"name":"engagement_ref","label":"Engagement ref","type":"text","required":true,"group":"Context"},
		{"name":"request_from","label":"Requested by","type":"ref","required":true,"group":"Parties","asset_class_filter":"ENG"},
		{"name":"request_to","label":"Requested from","type":"ref","required":true,"group":"Parties","asset_class_filter":"INDIV"},
		{"name":"request_text","label":"Request","type":"text","required":true,"group":"Content"},
		{"name":"category","label":"Category","type":"select","required":true,"group":"Content","options":["Technical document","financial document","regulatory","contractual","site-visit data","clarification"]},
		{"name":"requested_at","label":"Requested at","type":"text","required":true,"group":"Schedule"},
		{"name":"due_date","label":"Due date","type":"text","group":"Schedule"},
		{"name":"status","label":"Status","type":"select","required":true,"group":"Status","options":["Open","partial","fulfilled","escalated","declined"]},
		{"name":"fulfilled_at","label":"Fulfilled at","type":"text","group":"Status"},
		{"name":"response_quality","label":"Response quality","type":"select","group":"Status","options":["Complete","partial","evasive","unusable"]},
		{"name":"document_storage_uri","label":"Document storage URI","type":"text","group":"Storage"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'COMMP', 'Communication pattern', 'LAYER-1', 'commp-', '#d4a878', 'internal',
	'Reusable language and framing for sensitive conversations. Strategically valuable AND ethically sensitive — frame as "communicate honestly while preserving the relationship", never as "get what we want".',
	'[
		{"name":"pattern_type","label":"Pattern type","type":"select","required":true,"group":"Identity","options":["Findings delivery","scope pushback","deadline negotiation","escalation prevention","sponsor communication","lender pre-emption"]},
		{"name":"situation","label":"Situation","type":"text","required":true,"group":"Content"},
		{"name":"language_template","label":"Language template","type":"text","required":true,"group":"Content"},
		{"name":"counterparty_class","label":"Counterparty class","type":"select","group":"Scope","options":["lender MDB","lender commercial","sponsor IOC","sponsor independent","other"]},
		{"name":"source_findings","label":"Source findings (ext refs)","type":"list","group":"Evidence"},
		{"name":"adoption_count","label":"Adoption count","type":"number","group":"Usage"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'SITE-VISIT', 'Site visit', 'LAYER-1', 'site-', '#c8a868', 'restricted',
	'Captured artifacts and observations from physical site visits.',
	'[
		{"name":"engagement_ref","label":"Engagement ref","type":"text","required":true,"group":"Context"},
		{"name":"physical_asset_ref","label":"Physical asset","type":"ref","required":true,"group":"Subject","asset_class_filter":"PHYS"},
		{"name":"visit_date","label":"Visit date","type":"text","required":true,"group":"When"},
		{"name":"attendees","label":"Attendees","type":"array_ref","required":true,"group":"People","asset_class_filter":["ENG","INDIV"]},
		{"name":"location","label":"Location","type":"text","required":true,"group":"Where"},
		{"name":"objectives","label":"Objectives","type":"text","required":true,"group":"Content"},
		{"name":"observations","label":"Observations","type":"text","required":true,"group":"Content"},
		{"name":"findings_generated","label":"Findings generated (ext refs)","type":"list","group":"Outcome"},
		{"name":"photos_uri","label":"Photo URIs","type":"list","group":"Media"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, id_prefix = EXCLUDED.id_prefix,
	color = EXCLUDED.color, confidentiality_default = EXCLUDED.confidentiality_default,
	description = EXCLUDED.description, attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states, applicable_tabs = EXCLUDED.applicable_tabs;

-- =================================================================
-- LAYER 2 — ENGINEER ASSETS
-- =================================================================

INSERT INTO asset_class (code, label, family, id_prefix, color, confidentiality_default, description, attribute_fields, valid_lifecycle_states, applicable_tabs)
VALUES (
	'ENG', 'Engineer', 'LAYER-2', 'eng-', '#6b8ca8', 'internal',
	'An individual engineer or PM at the firm.',
	'[
		{"name":"role","label":"Role","type":"select","required":true,"group":"Identity","options":["Delivering engineer","project manager","partner","technical specialist"]},
		{"name":"seniority","label":"Seniority","type":"select","required":true,"group":"Identity","options":["Junior","mid","senior","principal","partner"]},
		{"name":"expertise_tags","label":"Expertise tags","type":"list","required":true,"group":"Skills"},
		{"name":"asset_class_experience","label":"Asset-class experience","type":"list","group":"Skills"},
		{"name":"jurisdiction_experience","label":"Jurisdiction experience","type":"list","group":"Skills"},
		{"name":"availability_pct","label":"Availability next Q","type":"number","unit":"%","group":"Capacity"},
		{"name":"start_date","label":"Start date","type":"text","required":true,"group":"Tenure"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
),
(
	'ENGH', 'Engineer-counterparty history', 'LAYER-2', 'engh-', '#88a0b4', 'restricted',
	'Specific working history between an LCI engineer and a counterparty individual. Computed-and-stored — derived from engagement records, kept as its own asset to answer "who on our team has worked with this person before?" without re-walking the graph.',
	'[
		{"name":"engineer_ref","label":"Engineer","type":"ref","required":true,"group":"Pair","asset_class_filter":"ENG"},
		{"name":"counterparty_ref","label":"Counterparty individual","type":"ref","required":true,"group":"Pair","asset_class_filter":"INDIV"},
		{"name":"shared_engagements","label":"Shared engagements (ext refs)","type":"list","required":true,"group":"History"},
		{"name":"interaction_quality","label":"Interaction quality","type":"select","group":"Assessment","options":["Productive","neutral","contentious"]},
		{"name":"last_interaction","label":"Last interaction","type":"text","group":"Cadence"}
	]'::jsonb,
	'[]'::jsonb, '["details","documents","history"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
	label = EXCLUDED.label, family = EXCLUDED.family, id_prefix = EXCLUDED.id_prefix,
	color = EXCLUDED.color, confidentiality_default = EXCLUDED.confidentiality_default,
	description = EXCLUDED.description, attribute_fields = EXCLUDED.attribute_fields,
	valid_lifecycle_states = EXCLUDED.valid_lifecycle_states, applicable_tabs = EXCLUDED.applicable_tabs;

COMMIT;