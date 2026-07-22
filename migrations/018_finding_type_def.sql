-- 018_finding_type_def.sql — domain finding-type vocabulary.
--
-- Loaded from published ontology bundles alongside the transaction rules
-- (migration 017). One row per type (unique on type): reloads upsert, a
-- newer version overwrites metadata, and a type that disappeared from the
-- loaded bundle is FLAGGED missing_from_bundle — never deleted (existing
-- findings may reference it).
--
-- kind='direct'  → offered in /findings/new (unless deprecated/missing)
-- kind='derived' → stored only, for the future review inbox (producer,
--                  title_template, decider_role are its metadata).

BEGIN;

CREATE TABLE IF NOT EXISTS finding_type_def (
	type                TEXT PRIMARY KEY,
	kind                TEXT NOT NULL CHECK (kind IN ('direct', 'derived')),
	domain_code         TEXT NOT NULL,
	domain_version      INT NOT NULL,
	content_hash        TEXT NOT NULL,
	description         TEXT,
	guidance            TEXT,
	producer            TEXT,
	default_severity    TEXT,
	title_template      TEXT,
	decider_role        TEXT,
	required_fields     JSONB NOT NULL DEFAULT '[]'::jsonb,
	deprecated          BOOLEAN NOT NULL DEFAULT FALSE,
	missing_from_bundle BOOLEAN NOT NULL DEFAULT FALSE,
	loaded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finding_type_def_kind ON finding_type_def (kind)
	WHERE NOT deprecated AND NOT missing_from_bundle;

COMMIT;
