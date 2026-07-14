-- NOTE: seeds bypass the asset write service (src/lib/server/asset-service.ts): no validation, no rules — fixtures only. Runtime writes must go through createAsset/updateAsset.
-- 004_dd_findings.sql — Lummus due-diligence assessments for the demo plant.
--
-- Mix of conditions (A/B/C/D), a pending and a not-in-scope row so the UI
-- exercises every empty-state branch. Findings and recommendations are
-- plausible but invented — this is demo data.
--
-- Idempotent: TRUNCATEs asset_assessment first. Safe to re-run.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed/004_dd_findings.sql

BEGIN;

TRUNCATE asset_assessment RESTART IDENTITY;

INSERT INTO asset_assessment (
	asset_id, condition_rating, remaining_useful_life_years, risk_score,
	capex_estimate_usd, status, assessed_by, assessed_on, summary,
	findings, recommendations
)
SELECT a.id, v.condition_rating, v.rul, v.risk, v.capex, v.status,
	v.assessor, v.assessed_on::date, v.summary, v.findings::jsonb, v.recommendations::jsonb
FROM asset a
JOIN (VALUES

-- ============================================================
-- Cooling water utility
-- ============================================================

('P-101A', 'B', 8.0, 2, 12000, 'assessed', 'L. Martin, Lummus Rotating Equipment', '2026-02-18',
	'Centrifugal pump in good operational condition. Vibration within ISO 10816 Zone B. Mechanical seal last replaced 2024; external casing in acceptable condition with minor erosion on discharge nozzle.',
	'[
		{"severity":"minor","title":"Discharge nozzle erosion","detail":"Localised wall thinning (~1.5 mm) on the 12 o''clock position of the discharge nozzle, consistent with mild cavitation."},
		{"severity":"observation","title":"Mechanical seal plan outdated","detail":"Plan 13 installed; current OEM recommendation for this fluid service is Plan 23 with external heat exchanger."}
	]',
	'[
		{"action":"Monitor discharge nozzle erosion at next turnaround (UT readings every 12 months).","priority":"monitor","capex_estimate_usd":2000,"timing":"next scheduled inspection"},
		{"action":"Upgrade to API Plan 23 seal support at next seal replacement.","priority":"planned","capex_estimate_usd":10000,"timing":"next seal change (~2 years)"}
	]'
),

('P-101B', 'B', 8.0, 2, 0, 'assessed', 'L. Martin, Lummus Rotating Equipment', '2026-02-18',
	'Identical sister pump to P-101A, in standby service. Condition slightly better due to lower running hours. No immediate action required.',
	'[
		{"severity":"observation","title":"Standby run-test schedule","detail":"Last documented standby rotation was 11 weeks ago; OEM recommends monthly."}
	]',
	'[
		{"action":"Reinstate monthly rotation-test procedure.","priority":"planned","capex_estimate_usd":0,"timing":"immediate"}
	]'
),

('P-220', 'C', 3.0, 3, 85000, 'assessed', 'L. Martin, Lummus Rotating Equipment', '2026-02-18',
	'Positive-displacement dosing pump showing progressive wear. Measured volumetric efficiency down 14% against OEM datasheet. Diaphragm due for replacement; metering accuracy drift flagged by operations.',
	'[
		{"severity":"major","title":"Volumetric efficiency loss","detail":"Actual 86% vs. rated 100% at design pressure; likely diaphragm fatigue and suction valve seat wear."},
		{"severity":"minor","title":"Glycol bypass valve leak","detail":"Intermittent weep at valve bonnet; not currently affecting operations."}
	]',
	'[
		{"action":"Replace diaphragm kit and suction valve internals.","priority":"urgent","capex_estimate_usd":45000,"timing":"within 6 months"},
		{"action":"Repack bonnet gland on glycol bypass valve.","priority":"planned","capex_estimate_usd":5000,"timing":"next planned shutdown"},
		{"action":"Consider full pump replacement if next test shows <80% volumetric efficiency.","priority":"monitor","capex_estimate_usd":35000,"timing":"12 months"}
	]'
),

('P-305', 'D', 0.5, 5, 220000, 'assessed', 'L. Martin, Lummus Rotating Equipment', '2026-02-18',
	'Submersible sump pump in critical condition. Motor insulation resistance has dropped below 1 MΩ, bearing vibration is in ISO 10816 Zone D, and impeller erosion from oily water service has exceeded 40% material loss on leading edges. Immediate replacement recommended.',
	'[
		{"severity":"critical","title":"Motor insulation failure imminent","detail":"IR test at 500 V DC gave 0.6 MΩ — industry floor is 1 MΩ, OEM minimum is 2 MΩ."},
		{"severity":"critical","title":"Bearing vibration Zone D","detail":"10.2 mm/s RMS measured at non-drive end. ISO 10816-3 Zone D is >7.1 mm/s for this machine class."},
		{"severity":"major","title":"Impeller erosion","detail":"Visual inspection during last pull showed >40% metal loss on leading edges of all three vanes."}
	]',
	'[
		{"action":"Replace pump assembly with upgraded duplex stainless impeller version.","priority":"urgent","capex_estimate_usd":180000,"timing":"within 3 months"},
		{"action":"Install permanent vibration monitoring on the replacement unit.","priority":"planned","capex_estimate_usd":40000,"timing":"at replacement"}
	]'
),

-- ============================================================
-- KM-145 Pumping Station — mainline pumps
-- ============================================================

('P-301A', 'A', 18.0, 1, 0, 'assessed', 'R. Okonkwo, Lummus Pipelines Practice', '2026-03-05',
	'Mainline pump in excellent condition. Performance curve matches OEM within 2%. All auxiliaries functioning nominally. No findings of note beyond routine observations.',
	'[
		{"severity":"observation","title":"Instrumentation age","detail":"Bearing temperature RTDs are original (2023); performance is still within spec, no action needed."}
	]',
	'[]'
),

('P-301B', 'B', 15.0, 2, 25000, 'assessed', 'R. Okonkwo, Lummus Pipelines Practice', '2026-03-05',
	'Mainline pump in good condition with one notable finding: outboard bearing temperature trending upward by ~3°C over the last 6 months. Within alarm limits but worth monitoring.',
	'[
		{"severity":"minor","title":"Outboard bearing temperature drift","detail":"Monthly average trending from 68°C (Oct 2025) to 71°C (Mar 2026). Alarm setpoint 85°C."}
	]',
	'[
		{"action":"Oil analysis and bearing endoscope inspection at next window.","priority":"planned","capex_estimate_usd":25000,"timing":"within 9 months"}
	]'
),

('P-301C', 'B', 16.0, 2, 15000, 'assessed', 'R. Okonkwo, Lummus Pipelines Practice', '2026-03-05',
	'Spare pump in standby. Good condition overall. Minor corrosion on external base plate from seawater spray — no structural concern but needs addressing for longevity.',
	'[
		{"severity":"minor","title":"Baseplate external corrosion","detail":"Scattered surface rust on east-facing baseplate edge; salt spray origin."}
	]',
	'[
		{"action":"Surface prep and re-coat baseplate during next turnaround.","priority":"planned","capex_estimate_usd":15000,"timing":"next turnaround"}
	]'
),

-- ============================================================
-- KM-145 — drive motor
-- ============================================================

('M-301A', 'C', 5.0, 4, 180000, 'assessed', 'S. Chen, Lummus Electrical Systems', '2026-03-05',
	'11 kV induction motor with several aging indicators. PD (partial discharge) test results on stator windings are trending upward, dielectric dissipation factor (tan δ) at the upper end of acceptable range. Cooling system fouled.',
	'[
		{"severity":"major","title":"Rising partial discharge activity","detail":"Peak PD magnitude increased 40% between 2024 and 2026 surveys. Still below OEM action threshold but trajectory is concerning."},
		{"severity":"major","title":"IC611 cooler fouling","detail":"Air-to-air heat exchanger fins visibly fouled; motor operating ~7°C above design at equivalent load."},
		{"severity":"minor","title":"Grease log incomplete","detail":"Gap in bearing re-greasing records between Q3 2024 and Q1 2025."}
	]',
	'[
		{"action":"Offline HV diagnostic test (tan δ, capacitance, IR) within 6 months.","priority":"urgent","capex_estimate_usd":30000,"timing":"6 months"},
		{"action":"Mechanical clean + vacuum impregnation of stator windings at next major inspection.","priority":"planned","capex_estimate_usd":120000,"timing":"next major outage"},
		{"action":"Clean IC611 cooler bundle.","priority":"urgent","capex_estimate_usd":30000,"timing":"3 months"}
	]'
),

-- ============================================================
-- KM-145 — pigging facility + metering
-- ============================================================

('TRAP-321', 'A', 22.0, 1, 0, 'assessed', 'T. Brandt, Lummus Mechanical Integrity', '2026-03-06',
	'Pig launcher in excellent condition. Recent UT survey shows no corrosion or wall thinning. All closures and PSVs current.',
	'[]',
	'[]'
),

('MET-331', 'B', 10.0, 2, 8000, 'assessed', 'D. Yusuf, Lummus Custody Transfer', '2026-03-06',
	'Custody transfer Coriolis meter skid within 0.08% verified accuracy (rated 0.1%). Calibration traceability current. Minor observation on upstream strainer pressure drop trending.',
	'[
		{"severity":"minor","title":"Strainer ΔP trending upward","detail":"ΔP increased from 0.2 barg to 0.35 barg over 8 months; suggests particulate accumulation."}
	]',
	'[
		{"action":"Clean or replace upstream strainer element.","priority":"planned","capex_estimate_usd":8000,"timing":"within 6 months"}
	]'
)

) AS v(
	tag, condition_rating, rul, risk, capex, status, assessor, assessed_on,
	summary, findings, recommendations
)
ON a.tag = v.tag;

-- One pending + one not-in-scope row so the UI exercises those empty states.
INSERT INTO asset_assessment (asset_id, status, assessed_by, summary)
SELECT id, 'pending', 'D. Yusuf, Lummus Custody Transfer',
	'Inspection scheduled for 2026-Q3; physical visit deferred due to pipeline operational window.'
FROM asset WHERE tag = 'MET-332';

INSERT INTO asset_assessment (asset_id, status, assessed_by)
SELECT id, 'not_in_scope', 'system'
FROM asset WHERE tag = 'SYS-110';

COMMIT;