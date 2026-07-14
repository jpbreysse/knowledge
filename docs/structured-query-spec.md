# Structured queries — design (v3.2 candidate)

*The question that triggered this: "how do I search for an asset that is a
software with sensitive data?" — which is not a text search but a typed
predicate: `class = SOFTWARE AND data_classification = 'sensitive'`.*

## Principle

The class schema already tells us every field's name, type, and options.
A structured query is just: **pick a class → the schema becomes the filter
UI**. No free text, no guessing, no `Sensitive`-vs-`sensitive` misses —
select fields filter by their declared options, numbers by comparison,
dates by range, refs by picking an asset.

This is the same move the asset form makes (schema → form); now it's
schema → query. Ontology as leverage, third time.

## Query model (v1)

A query = base filters + zero or more attribute conditions, **AND-ed**.

| Field type | Operators | UI input |
|---|---|---|
| `select` | is, is one of | dropdown of the declared options |
| `number` | =, ≥, ≤, between | numeric input(s) |
| `date` | before, after, between | date picker(s) |
| `boolean` | is | toggle |
| `text` | contains, equals | text input |
| `ref` | is | AssetPicker (chip) |
| `array_ref` | contains | AssetPicker (chip) |
| base: `confidentiality` | is | dropdown |
| base: parent | under (subtree) | AssetPicker — uses the recursive CTE |

No OR in v1. OR arrives with JSONLogic (see "the v3.3 bridge") — putting it
in the chip UI now would triple the complexity for a case nobody has asked
for yet.

## Representation — flat URL params

```
/assets?class_code=SOFTWARE&attr.data_classification=sensitive
/assets?class_code=PUMP-CENTRIFUGAL&attr.criticality.gte=4&attr.lifecycle_state=operating
/assets?class_code=TX&attr.syndicate_lead_ref=<uuid>
/assets?under=<area-uuid>&attr.criticality.gte=4
```

Convention: `attr.<field>` (equals), `attr.<field>.gte|lte|before|after|contains`
(operators), repeated params = "one of". Server validates every `attr.*`
against the class's `attribute_fields` — unknown field or wrong-typed value
→ 400, not silence.

Why flat params and not a JSON DSL in the URL: shareable, bookmarkable,
readable, and the CSV export can honor the exact same params.

## SQL mapping

Typed casts over the existing JSONB — no schema change:

```sql
attributes->>'data_classification' = 'sensitive'
(attributes->>'criticality')::numeric >= 4
(attributes->>'commissioning_date')::date < '2021-01-01'
attributes->>'syndicate_lead_ref' = '<uuid>'
attributes->'syndicate_members' ? '<uuid>'          -- array_ref contains
```

Fine unindexed at ≤ 5k rows; expression indexes or GIN when it grows.

## UI — filter chips on /assets

```
[ Class: SOFTWARE ▾ ]  [ + Add filter ]
  ┌─ data_classification is [sensitive ▾] ×
  └─ vendor contains [internal        ] ×
   → 2 results                     [Save view…]
```

- "+ Add filter" appears once a class is chosen (schema known); it lists the
  class's fields with type-appropriate inputs.
- Each condition is a removable chip; everything round-trips through the URL.
- The text search box stays — text and structure compose (AND).
- **Export CSV honors the active query** (today it exports the whole
  register regardless of filters — this fixes that too).

## Saved views (phase 2, cheap and demo-gold)

```sql
CREATE TABLE saved_view (
  id uuid PK, name text NOT NULL, target text NOT NULL DEFAULT 'asset',
  params jsonb NOT NULL,           -- the query string, parsed
  created_by text, created_at timestamptz
);
```

"Sensitive software", "Critical operating pumps", "Peru engagements" — one
click from a dropdown on /assets and from the ⌘K Actions section. This is
the demo moment: *a senior partner encodes a question once; everyone reuses
it.* (Palantir calls these object sets.)

## The v3.3 bridge — build once, use twice

A chip like `criticality ≥ 4` serializes naturally to JSONLogic:

```json
{ ">=": [{ "var": "criticality" }, 4] }
```

which is **exactly the condition format of `asset_rule` in the v3.3 spec**.
The same condition-builder component becomes the rule-authoring UI ("WHEN an
asset of class X matches *these chips* → raise proposal"), and a saved view
is one click away from becoming a rule. Structured query isn't a detour
before the rules engine — it's the front half of it.

## Effort

| Piece | Est. |
|---|---|
| Server: `attr.*` param parsing + typed SQL builder + validation | 2 h |
| UI: chip builder with per-type inputs, URL sync | 3 h |
| Export CSV honors filters | 30 min |
| Smoke + docs | 30 min |
| **v1 total** | **~6 h** |
| Phase 2: saved views (table, API, dropdown, ⌘K) | +2 h |

## Open questions

1. **Saved views in v1 or phase 2?** (I'd do v1 without, ship, then add —
   but it's the flashiest part for a demo.)
2. **Cross-class attribute queries** — "criticality ≥ 4 across ALL classes"
   works today via shared key names; v1 requires picking a class first.
   Acceptable?
3. **Findings page too?** It already has severity/status chips; extending
   the same builder there is +1 h. Defer?
