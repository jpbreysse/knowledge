-- 019_reasoning.sql — reasoning runtime + review inbox substrate.
--
-- asset_rule.enforcement discriminates transaction (synchronous blockers)
-- from reasoning (async, produce proposals). The transaction interpreter
-- filters on it; the reasoning evaluator reads the other side.
--
-- finding gains the proposal lifecycle: review_status NULL = human-raised
-- finding (unchanged behavior); 'pending' = derived proposal awaiting review
-- (hidden from normal lists); 'accepted' = visible, marked derived;
-- 'rejected' = hidden, kept as calibration signal. Provenance columns tie a
-- derived finding to the exact rule + domain version that produced it.

BEGIN;

ALTER TABLE asset_rule
	ADD COLUMN IF NOT EXISTS enforcement TEXT NOT NULL DEFAULT 'transaction';
ALTER TABLE asset_rule DROP CONSTRAINT IF EXISTS asset_rule_enforcement_check;
ALTER TABLE asset_rule ADD CONSTRAINT asset_rule_enforcement_check
	CHECK (enforcement IN ('transaction', 'reasoning'));

ALTER TABLE finding
	ADD COLUMN IF NOT EXISTS review_status   TEXT,
	ADD COLUMN IF NOT EXISTS review_reason   TEXT,
	ADD COLUMN IF NOT EXISTS rule_id         TEXT,
	ADD COLUMN IF NOT EXISTS rule_version    INT,
	ADD COLUMN IF NOT EXISTS domain_version  INT,
	ADD COLUMN IF NOT EXISTS trigger_summary TEXT;
ALTER TABLE finding DROP CONSTRAINT IF EXISTS finding_review_status_valid;
ALTER TABLE finding ADD CONSTRAINT finding_review_status_valid
	CHECK (review_status IS NULL OR review_status IN ('pending', 'accepted', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_finding_pending ON finding (raised_at DESC)
	WHERE review_status = 'pending';

COMMIT;
