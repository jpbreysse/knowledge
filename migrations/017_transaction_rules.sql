-- 017_transaction_rules.sql — transaction-rule engine substrate.
--
-- asset_rule: transaction-enforcement rules loaded from published ontology
-- bundles (only rules with enforcement='transaction'; reasoning rules never
-- land here). Loading domain version N enables N's rules and disables every
-- other version's rows for that domain — older rows are kept for provenance,
-- never deleted. spec is the load-time-normalized shape the interpreter
-- executes; spec.raw carries the bundle original for debugging.
--
-- rule_rejection: provenance of refusals. A rejected write changes no row,
-- so the asset_history trigger never fires — this sibling table records who
-- was blocked, on what, by which rule (id + rule_version + domain_version).

BEGIN;

CREATE TABLE IF NOT EXISTS asset_rule (
	id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	rule_id        TEXT NOT NULL,
	rule_version   INT NOT NULL,
	domain_code    TEXT NOT NULL,
	domain_version INT NOT NULL,
	content_hash   TEXT NOT NULL,
	class_code     TEXT NOT NULL,
	spec           JSONB NOT NULL,
	enabled        BOOLEAN NOT NULL DEFAULT TRUE,
	loaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT asset_rule_identity UNIQUE (rule_id, rule_version, domain_version)
);

CREATE INDEX IF NOT EXISTS idx_asset_rule_class ON asset_rule (class_code) WHERE enabled;

CREATE TABLE IF NOT EXISTS rule_rejection (
	id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	actor          TEXT,
	asset_id       UUID,          -- null when the rejection blocked a create
	asset_tag      TEXT,
	class_code     TEXT NOT NULL,
	rule_id        TEXT NOT NULL,
	rule_version   INT NOT NULL,
	domain_version INT NOT NULL,
	message        TEXT NOT NULL,
	created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rule_rejection_created ON rule_rejection (created_at DESC);

COMMIT;
