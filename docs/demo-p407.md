# Demo — the P-407 loop

One pump, one finding, one round trip between the asset register and the
knowledge app. Shows the write service, the audit trail, the outbound
Raise-finding link, and the kn-pool read — end to end.

## Prerequisites

- Postgres up (`postgres-pgvector` container), `asset_dev` migrated through 014.
- Asset app dev server: `npm run dev` (port 5177).
- Knowledge app running on `KNOWLEDGE_URL` (default `http://localhost:5178`)
  with its DB reachable via `KNOWLEDGE_DATABASE_URL`.

## Walkthrough

1. **Seed** — `npm run demo:p407:seed`
   Creates `P-407 · Sump drain pump` (class `PUMP-SUBMERSIBLE`) **through
   `createAsset()`** — the write service, not raw SQL — with actor
   `demo-seed`. Idempotent: re-running reports "already exists" and exits 0.
   This doubles as the write-service integration test: the run asserts an
   `asset_history` row `created | demo-seed` (INSERT audit, migration 014).

2. **Open** — `/assets`, search `P-407`, open it. Every attribute you see
   (manufacturer, model, criticality, …) is rendered generically from
   PUMP-SUBMERSIBLE's `attribute_fields` — nothing is hardcoded.

3. **Raise** — in the **Findings** section, click **Raise finding**. It opens
   the knowledge app in a new tab at
   `/findings/new?asset_id=…&asset_tag=P-407&asset_display=P-407%20—%20Sump%20drain%20pump`.
   The button only renders when `KNOWLEDGE_URL` is set; no connector row, no
   new env var.

4. **Create** — fill in the finding in the knowledge app (e.g. type
   `inspection`, severity `medium`, "Corrosion found on impeller housing")
   and save. The knowledge app links it to the asset via the prefilled params.

5. **Reload** — go back to the P-407 tab and reload. The finding appears
   under **Findings (n)**. No webhook, no cache, no extra build: the asset
   page reads `kn_findings`/`kn_finding_asset` directly from the knowledge DB
   on every server load, so **a reload is all it takes**.

## Smoke checklist

`npm run demo:p407` prints green/red for:

- (a) P-407 exists; all attributes declared by PUMP-SUBMERSIBLE; page renders
  (page check warns instead of failing when the dev server is down)
- (b) `asset_history` has `created | demo-seed`
- (c) the Raise-finding URL carries the three query params
- (d) `KNOWLEDGE_URL` is set (warn only)
- (e) re-running the seed is a no-op

## Cleanup

```sql
DELETE FROM asset WHERE tag = 'P-407';  -- history rows cascade
```
