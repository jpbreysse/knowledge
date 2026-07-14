-- 012_entity_link.sql — typed cross-links between assets (v3.1).
--
-- Realises the deferred v2.0 typed-relationships work (originally scoped as
-- `asset_relationship` in docs/v2-spec.md) under the vocabulary the v3.1
-- DD-vertical spec uses:
--   source_id → target_id, relation_type (default participates_in).
--
-- Directed edges, cycles allowed, no self-loops, no duplicate triples,
-- cascading delete when either endpoint asset is removed.
--
-- Vocabulary starts tight — only 'participates_in'. Widening later means
-- DROP CONSTRAINT / ADD CONSTRAINT on entity_link_relation_type_check.
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/012_entity_link.sql

BEGIN;

CREATE TABLE entity_link (
	id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	source_id     UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
	target_id     UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
	relation_type TEXT NOT NULL
		CHECK (relation_type IN ('participates_in')),
	attributes    JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_by    TEXT,
	CHECK (source_id <> target_id),
	UNIQUE (source_id, target_id, relation_type)
);

CREATE INDEX idx_entity_link_source ON entity_link (source_id);
CREATE INDEX idx_entity_link_target ON entity_link (target_id);
CREATE INDEX idx_entity_link_type   ON entity_link (relation_type);

COMMIT;
