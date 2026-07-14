-- 004_asset_assessment.sql — Lummus due-diligence overlay.
-- One or many assessments per asset; the UI surfaces the most recent one.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/004_asset_assessment.sql

BEGIN;

CREATE TABLE asset_assessment (
	id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	asset_id                      UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
	-- Nullable: pending and not_in_scope rows don't have a rating yet.
	condition_rating              TEXT
		CHECK (condition_rating IS NULL OR condition_rating IN ('A','B','C','D')),
	remaining_useful_life_years   NUMERIC(5,1),
	risk_score                    SMALLINT CHECK (risk_score BETWEEN 1 AND 5),
	capex_estimate_usd            BIGINT,
	status                        TEXT NOT NULL DEFAULT 'assessed'
		CHECK (status IN ('assessed','pending','not_in_scope')),
	assessed_by                   TEXT,
	assessed_on                   DATE,
	summary                       TEXT,
	findings                      JSONB NOT NULL DEFAULT '[]'::jsonb,
	recommendations               JSONB NOT NULL DEFAULT '[]'::jsonb,
	created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_assessment_asset_id  ON asset_assessment (asset_id);
CREATE INDEX idx_asset_assessment_condition ON asset_assessment (condition_rating);
CREATE INDEX idx_asset_assessment_status    ON asset_assessment (status);

COMMIT;
