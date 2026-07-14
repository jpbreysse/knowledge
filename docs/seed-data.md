# Seed data

Two independent example trees ship with the project. Each is in its own SQL file and can be loaded separately.

| File                              | Loaded by               | Purpose                                                                  |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `seed.sql`                        | `npm run db:seed`       | Example 1 — cooling water utility                                        |
| `seed/002_pumping_station.sql`    | `npm run db:seed:002`   | Example 2 — KM-145 mainline pumping station (motors, pig traps, meters)  |
| `seed/004_dd_findings.sql`        | `npm run db:seed:004`   | Example 4 — Lummus DD assessments across 10 of the existing assets       |

`seed.sql` truncates the three tables first; `seed/002_pumping_station.sql` is purely additive (`ON CONFLICT (tag) DO NOTHING`). Run them in order if you want both: `db:seed` then `db:seed:002`.

## Example 1 — Cooling water utility (`seed.sql`)

A small operational water-handling utility under a single site. Useful for exercising the pump-attribute UI and the parent-child tree.

```
SITE-01  North Site
└── AREA-100  Utilities Area
    └── SYS-110  Cooling Water System
        ├── P-101A  Cooling water pump A   (PUMP-CENTRIFUGAL,           operating, crit 2)
        ├── P-101B  Cooling water pump B   (PUMP-CENTRIFUGAL,           standby,   crit 2)
        ├── P-220   Glycol dosing pump     (PUMP-POSITIVE-DISPLACEMENT, operating, crit 3)
        └── P-305   Sump drain pump        (PUMP-SUBMERSIBLE,           operating, crit 4)
```

One example document is attached to P-101A (`P-101A_datasheet.pdf`, no real file on disk).

## Example 2 — KM-145 Pumping Station (`seed/002_pumping_station.sql`)

A mainline crude-oil pumping station with N+1 pump redundancy plus pigging and custody-transfer facilities. Introduces three new equipment types: `MOTOR-ELECTRIC`, `PIG-TRAP`, `METER-CORIOLIS` (added by `migrations/002_extend_class_codes.sql`).

```
SITE-03  KM-145 Pumping Station
└── AREA-300  Main pumping area
    ├── SYS-310  Mainline pumping
    │   ├── P-301A  Mainline pump 1          (PUMP-CENTRIFUGAL, operating, crit 4)
    │   ├── P-301B  Mainline pump 2          (PUMP-CENTRIFUGAL, operating, crit 4)
    │   ├── P-301C  Mainline pump 3 (spare)  (PUMP-CENTRIFUGAL, standby,   crit 4)
    │   ├── M-301A  Drive motor for P-301A   (MOTOR-ELECTRIC,   operating, crit 4)
    │   ├── M-301B  Drive motor for P-301B   (MOTOR-ELECTRIC,   operating, crit 4)
    │   └── M-301C  Drive motor for P-301C   (MOTOR-ELECTRIC,   standby,   crit 4)
    ├── SYS-320  Scraper and pigging facility
    │   ├── TRAP-321  Pig launcher           (PIG-TRAP,         operating, crit 2)
    │   └── TRAP-322  Pig receiver           (PIG-TRAP,         operating, crit 2)
    └── SYS-330  Custody transfer metering
        ├── MET-331  Coriolis meter skid A   (METER-CORIOLIS,   operating, crit 5)
        └── MET-332  Coriolis meter skid B   (METER-CORIOLIS,   operating, crit 5)
```

### Why the motors sit beside the pumps, not under them

The schema only encodes parent-child containment via `asset.parent_id`. The functional "drives" relationship between each motor and its pump cannot be expressed with a single tree, so motors are modelled as siblings to the pumps under `SYS-310`. Typed relationships (`drives`, `feeds`, `connectedTo`) land in v2 with the `asset_relationship` table.

## Tag conventions

Used by both seed examples. Stick to these prefixes when adding new data so the existing list/tree/graph views stay readable.

| Prefix      | Class                            | Example     |
| ----------- | -------------------------------- | ----------- |
| `SITE-0n`   | SITE                             | `SITE-03`   |
| `AREA-n00`  | AREA                             | `AREA-300`  |
| `SYS-nn0`   | SYSTEM                           | `SYS-310`   |
| `P-n0n`     | PUMP-* (any subtype)             | `P-301A`    |
| `M-n0n`     | MOTOR-ELECTRIC                   | `M-301A`    |
| `TRAP-n2n`  | PIG-TRAP                         | `TRAP-321`  |
| `MET-n3n`   | METER-CORIOLIS (custody)         | `MET-331`   |

The numeric block follows the parent system: assets under `SYS-3n0` start with `n0n` (e.g. `SYS-310 → P-301x`, `SYS-320 → TRAP-32x`, `SYS-330 → MET-33x`).

## Example 4 — Lummus DD findings (`seed/004_dd_findings.sql`)

Ten due-diligence assessments across the existing register, plus one `pending` and one `not_in_scope` entry to exercise every UI branch:

| Asset        | Condition | RUL (y) | Risk | CapEx USD | Status        |
| ------------ | --------- | ------- | ---- | --------- | ------------- |
| P-101A       | B         | 8       | 2    | 12 000    | assessed      |
| P-101B       | B         | 8       | 2    | 0         | assessed      |
| P-220        | C         | 3       | 3    | 85 000    | assessed      |
| P-305        | D         | 0.5     | 5    | 220 000   | assessed      |
| P-301A       | A         | 18      | 1    | 0         | assessed      |
| P-301B       | B         | 15      | 2    | 25 000    | assessed      |
| P-301C       | B         | 16      | 2    | 15 000    | assessed      |
| M-301A       | C         | 5       | 4    | 180 000   | assessed      |
| TRAP-321     | A         | 22      | 1    | 0         | assessed      |
| MET-331      | B         | 10      | 2    | 8 000     | assessed      |
| MET-332      | —         | —       | —    | —         | pending       |
| SYS-110      | —         | —       | —    | —         | not_in_scope  |

Findings and recommendations on each assessed row are plausible-but-invented demo text (bearing wear, seal plan upgrades, coil fouling, impeller erosion, etc.). The seed `TRUNCATE`s `asset_assessment` at the top, so re-running is idempotent.
