# Demo — the P-407 loop

One pump, one finding, one continuous flow — all inside the asset app since
the findings merge (see `docs/findings-merge-plan.md`). Shows the write
service, the audit trail, and the findings loop with zero cross-app plumbing.

## Prerequisites

- Postgres up (`postgres-pgvector` container), `asset_dev` migrated through 015.
- Asset app dev server: `npm run dev` (port 5177).
- Optional: the document-store app (port 3001) — only needed for finding
  *descriptions* (they live there as ProseMirror docs). Findings themselves
  work without it.

## Walkthrough

1. **Seed** — `npm run demo:p407:seed`
   Creates `P-407 · Sump drain pump` (class `PUMP-SUBMERSIBLE`) **through
   `createAsset()`** — the write service, not raw SQL — with actor
   `demo-seed`. Idempotent: re-running reports "already exists" and exits 0.
   The run asserts its own `asset_history` row: `created | demo-seed`.

2. **Open** — `/assets`, search `P-407`, open it. Every attribute you see is
   rendered generically from PUMP-SUBMERSIBLE's `attribute_fields`.

3. **Raise** — in the **Findings** section, click **Raise finding**. Same
   tab, internal route: `/findings/new?asset_id=…&return_to=/assets/…`. The
   asset appears as a pre-linked chip above the form.

4. **Create** — type a title (e.g. "Corrosion found on impeller housing"),
   pick a severity, save.

5. **You're back.** The save links the finding to P-407 and returns you
   straight to the asset page — the finding is already in **Findings (n)**.
   No second app, no tab juggling, no reload semantics: one loop.

From the finding itself (`/findings/[id]`): walk the status lifecycle
(raised → reviewed → … → closed), link more assets, link supporting
documents from the federated document store, and write the long-form
description in the document editor.

## Smoke checklist

`npm run demo:p407` prints green/red for:

- (a) P-407 exists; all attributes declared by PUMP-SUBMERSIBLE; page renders
  (page check warns instead of failing when the dev server is down)
- (b) `asset_history` has `created | demo-seed`
- (c) the Raise-finding URL is internal and carries asset_id + return_to
- (d) the `document-store` connector is enabled (warn only — descriptions)
- (e) re-running the seed is a no-op

## Cleanup

```sql
DELETE FROM asset WHERE tag = 'P-407';  -- history + finding links cascade
```
