# Lummus DD overlay — v2.1

A due-diligence assessment attached to an asset. Turns the asset register into a customer portal showing the findings and recommendations of a Lummus DD engagement.

## Data model

Table: `asset_assessment` — one row per DD visit on an asset. Multiple rows per asset are allowed (reassessments over time); the UI shows the most recent one.

| Column                          | Type          | Notes                                                                          |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| `id`                            | UUID PK       |                                                                                |
| `asset_id`                      | UUID FK       | `ON DELETE CASCADE`                                                            |
| `condition_rating`              | TEXT          | Nullable — `A`/`B`/`C`/`D`. Always null when `status` is `pending` or `not_in_scope`. |
| `remaining_useful_life_years`   | NUMERIC(5,1)  | Years                                                                          |
| `risk_score`                    | SMALLINT      | 1–5, forward-looking failure risk (not the same as `asset.criticality`)        |
| `capex_estimate_usd`            | BIGINT        | Sum of all recommended actions on this asset                                   |
| `status`                        | TEXT          | `assessed` \| `pending` \| `not_in_scope`                                      |
| `assessed_by`                   | TEXT          | Engineer name + Lummus practice                                                |
| `assessed_on`                   | DATE          |                                                                                |
| `summary`                       | TEXT          | Narrative paragraph                                                            |
| `findings`                      | JSONB         | Array — see below                                                              |
| `recommendations`               | JSONB         | Array — see below                                                              |
| `created_at`                    | TIMESTAMPTZ   |                                                                                |

Indexes: `asset_id`, `condition_rating`, `status`.

### Condition rating meanings

- **A** — Excellent / like new. No material findings.
- **B** — Good. Minor wear; routine monitoring.
- **C** — Needs attention. Planned refurbishment or corrective action.
- **D** — Critical. Immediate action recommended.

### `findings` shape

Array of objects:

```json
[
  {
    "severity": "critical | major | minor | observation",
    "title": "short one-line description",
    "detail": "optional longer explanation"
  }
]
```

### `recommendations` shape

Array of objects:

```json
[
  {
    "action": "what to do",
    "priority": "urgent | planned | monitor",
    "capex_estimate_usd": 45000,
    "timing": "free-text window, e.g. 'within 6 months' or 'next turnaround'"
  }
]
```

## UI surfaces

| Page                 | What it shows                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/` home             | Four KPI tiles (total assets, assessed count, critical-findings count, recommended CapEx sum) + top 3 critical    |
| `/assets` list       | "DD" column with coloured condition badge, plus a Condition filter (A/B/C/D/Unassessed)                           |
| `/assets/[id]`       | New "Lummus DD" tab: header strip + summary + findings (sorted by severity) + recommendations table               |
| `/graph`             | "Colour by" toggle (Class | Condition). In condition mode, fill colour is driven by latest assessment             |

Condition-rating colours (in [`src/lib/constants.ts`](../src/lib/constants.ts)):

| Rating       | Hex       |
| ------------ | --------- |
| A            | `#2d8a5f` |
| B            | `#a3c266` |
| C            | `#e0a936` |
| D            | `#c04a3d` |
| Not assessed | `#9ca3af` |

## API

- `GET /api/assets/[id]/assessments` — all assessments for the asset, newest first.
- `GET /api/assets` now includes `latestCondition` and `latestAssessmentStatus` on every row. Accepts `?condition_rating=A|B|C|D|unassessed`.
- `GET /api/graph` nodes now include `data.condition` and `data.assessment_status`.

There is no write API in v2.1 — the portal is read-only for customer engineers. Assessments are authored by seeding or direct SQL until the in-app authoring UI ships.

## Extending the vocabulary

- New condition rating: update the CHECK constraint on `asset_assessment.condition_rating` via a migration, then add to `CONDITION_RATINGS` / `CONDITION_COLORS` / `CONDITION_LABELS` in [`src/lib/constants.ts`](../src/lib/constants.ts).
- New finding severity or recommendation priority: update `FINDING_SEVERITIES` / `RECOMMENDATION_PRIORITIES` in the same file, and extend the `SEVERITY_STYLE` / `PRIORITY_STYLE` maps in [`src/routes/assets/[id]/+page.svelte`](../src/routes/assets/[id]/+page.svelte).
