-- NOTE: seeds bypass the asset write service (src/lib/server/asset-service.ts): no validation, no rules — fixtures only. Runtime writes must go through createAsset/updateAsset.
-- 002_pumping_station.sql — second seed example: KM-145 mainline pumping station.
--
-- Adds a SITE with three SYSTEMs: mainline pumping (3+1 N+1 centrifugal pumps + their
-- drive motors), pigging facility (launcher + receiver), and custody transfer metering
-- (two Coriolis meters). All in operating/standby — no decommissioned assets here.
--
-- v3.1: equipment fields (manufacturer, model, criticality, lifecycle_state, location,
-- commissioning_date) live in `attributes` JSONB now — migration 013 moved them off
-- the asset row.
--
-- Idempotent: ON CONFLICT (tag) DO NOTHING means re-running this script is safe.
-- This script does NOT touch the cooling water seed (seed.sql at the project root).
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed/002_pumping_station.sql

BEGIN;

-- 1. Site
INSERT INTO asset (id, tag, name, class_code, attributes, updated_by)
VALUES (gen_random_uuid(), 'SITE-03', 'KM-145 Pumping Station', 'SITE',
	'{"lifecycle_state":"operating"}'::jsonb, 'seed')
ON CONFLICT (tag) DO NOTHING;

-- 2. Area
INSERT INTO asset (id, tag, name, class_code, parent_id, attributes, updated_by)
VALUES (
	gen_random_uuid(), 'AREA-300', 'Main pumping area', 'AREA',
	(SELECT id FROM asset WHERE tag = 'SITE-03'),
	'{"lifecycle_state":"operating"}'::jsonb, 'seed'
)
ON CONFLICT (tag) DO NOTHING;

-- 3. Systems
INSERT INTO asset (id, tag, name, class_code, parent_id, attributes, updated_by)
VALUES
	(gen_random_uuid(), 'SYS-310', 'Mainline pumping', 'SYSTEM',
		(SELECT id FROM asset WHERE tag = 'AREA-300'),
		'{"lifecycle_state":"operating"}'::jsonb, 'seed'),
	(gen_random_uuid(), 'SYS-320', 'Scraper and pigging facility', 'SYSTEM',
		(SELECT id FROM asset WHERE tag = 'AREA-300'),
		'{"lifecycle_state":"operating"}'::jsonb, 'seed'),
	(gen_random_uuid(), 'SYS-330', 'Custody transfer metering', 'SYSTEM',
		(SELECT id FROM asset WHERE tag = 'AREA-300'),
		'{"lifecycle_state":"operating"}'::jsonb, 'seed')
ON CONFLICT (tag) DO NOTHING;

-- 4. Mainline pumps (under SYS-310). N+1: A and B operating, C on standby.
INSERT INTO asset (id, tag, name, class_code, parent_id, attributes, updated_by)
SELECT
	gen_random_uuid(), v.tag, v.name, 'PUMP-CENTRIFUGAL',
	(SELECT id FROM asset WHERE tag = 'SYS-310'),
	jsonb_build_object(
		'manufacturer','Sulzer','model','MSD-14-4','criticality',4,
		'lifecycle_state', v.lifecycle_state, 'location', v.location,
		'commissioning_date','2023-05-15',
		'rated_flow_m3h',1200,'rated_head_m',850,'rated_power_kw',3000,
		'fluid','crude oil','speed_rpm',3000,
		'suction_pressure_bar',15,'discharge_pressure_bar',75,'npsh_required_m',8.5
	),
	'seed'
FROM (VALUES
	('P-301A', 'Mainline pump 1',         'operating', 'Pump hall, bay 1'),
	('P-301B', 'Mainline pump 2',         'operating', 'Pump hall, bay 2'),
	('P-301C', 'Mainline pump 3 (spare)', 'standby',   'Pump hall, bay 3')
) AS v(tag, name, lifecycle_state, location)
ON CONFLICT (tag) DO NOTHING;

-- 5. Drive motors (under SYS-310). One per pump; lifecycle mirrors its pump.
INSERT INTO asset (id, tag, name, class_code, parent_id, attributes, updated_by)
SELECT
	gen_random_uuid(), v.tag, v.name, 'MOTOR-ELECTRIC',
	(SELECT id FROM asset WHERE tag = 'SYS-310'),
	jsonb_build_object(
		'manufacturer','ABB','model','AMI 710','criticality',4,
		'lifecycle_state', v.lifecycle_state, 'location', v.location,
		'commissioning_date','2023-05-15',
		'rated_power_kw',3300,'rated_voltage_v',11000,'speed_rpm',3000,
		'frequency_hz',50,'enclosure','IP55',
		'insulation_class','F','cooling','IC611 air-to-air'
	),
	'seed'
FROM (VALUES
	('M-301A', 'Drive motor for P-301A', 'operating', 'Pump hall, bay 1'),
	('M-301B', 'Drive motor for P-301B', 'operating', 'Pump hall, bay 2'),
	('M-301C', 'Drive motor for P-301C', 'standby',   'Pump hall, bay 3')
) AS v(tag, name, lifecycle_state, location)
ON CONFLICT (tag) DO NOTHING;

-- 6. Pig launcher and receiver (under SYS-320)
INSERT INTO asset (id, tag, name, class_code, parent_id, attributes, updated_by)
SELECT
	gen_random_uuid(), v.tag, v.name, 'PIG-TRAP',
	(SELECT id FROM asset WHERE tag = 'SYS-320'),
	jsonb_build_object(
		'manufacturer','T.D. Williamson','criticality',2,
		'lifecycle_state','operating','location',v.location,
		'commissioning_date','2023-05-15',
		'nominal_diameter_in',24,'design_pressure_bar',100,
		'material','carbon steel','type','bi-directional'
	),
	'seed'
FROM (VALUES
	('TRAP-321', 'Pig launcher', 'Launcher pad'),
	('TRAP-322', 'Pig receiver', 'Receiver pad')
) AS v(tag, name, location)
ON CONFLICT (tag) DO NOTHING;

-- 7. Custody transfer Coriolis meters (under SYS-330)
INSERT INTO asset (id, tag, name, class_code, parent_id, attributes, updated_by)
SELECT
	gen_random_uuid(), v.tag, v.name, 'METER-CORIOLIS',
	(SELECT id FROM asset WHERE tag = 'SYS-330'),
	jsonb_build_object(
		'manufacturer','Emerson','model','Micro Motion CMF400','criticality',5,
		'lifecycle_state','operating','location',v.location,
		'commissioning_date','2023-05-15',
		'nominal_diameter_in',6,'flow_range_m3h','20 to 1500',
		'accuracy_class','0.1%','custody_transfer_certified',true,
		'applicable_standards',jsonb_build_array('OIML R117','API MPMS 5.6')
	),
	'seed'
FROM (VALUES
	('MET-331', 'Coriolis meter skid A', 'Metering skid A'),
	('MET-332', 'Coriolis meter skid B', 'Metering skid B')
) AS v(tag, name, location)
ON CONFLICT (tag) DO NOTHING;

COMMIT;