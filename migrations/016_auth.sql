-- 016_auth.sql — Better Auth tables (docs/auth-plan.md) + audit attribution.
--
-- Four tables in Better Auth's canonical shape (v1.6, admin plugin fields
-- included), snake_case columns, auth_ prefix. IDs are TEXT — Better Auth
-- generates its own ids. Passwords live on auth_account (provider
-- 'credential'), scrypt-hashed by Better Auth.
--
-- Also: audit_log learns who made each request.

BEGIN;

CREATE TABLE IF NOT EXISTS auth_user (
	id             TEXT PRIMARY KEY,
	name           TEXT NOT NULL,
	email          TEXT NOT NULL UNIQUE,
	email_verified BOOLEAN NOT NULL DEFAULT FALSE,
	image          TEXT,
	role           TEXT,
	banned         BOOLEAN,
	ban_reason     TEXT,
	ban_expires    TIMESTAMPTZ,
	created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_session (
	id              TEXT PRIMARY KEY,
	token           TEXT NOT NULL UNIQUE,
	user_id         TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
	expires_at      TIMESTAMPTZ NOT NULL,
	ip_address      TEXT,
	user_agent      TEXT,
	impersonated_by TEXT,
	created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_session_user ON auth_session (user_id);

CREATE TABLE IF NOT EXISTS auth_account (
	id                       TEXT PRIMARY KEY,
	account_id               TEXT NOT NULL,
	provider_id              TEXT NOT NULL,
	user_id                  TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
	access_token             TEXT,
	refresh_token            TEXT,
	id_token                 TEXT,
	access_token_expires_at  TIMESTAMPTZ,
	refresh_token_expires_at TIMESTAMPTZ,
	scope                    TEXT,
	password                 TEXT,
	created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_account_user ON auth_account (user_id);

CREATE TABLE IF NOT EXISTS auth_verification (
	id         TEXT PRIMARY KEY,
	identifier TEXT NOT NULL,
	value      TEXT NOT NULL,
	expires_at TIMESTAMPTZ NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Who made each API request (filled by hooks.server.ts).
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_email TEXT;

COMMIT;
