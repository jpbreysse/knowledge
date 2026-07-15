# Deploying to Scalingo — Asset Registry

Runbook for the asset app on Scalingo. Structure borrowed from the COMEX
Portfolio runbook (proven ops patterns), corrected and adapted: Node-only
stack, Better Auth, psql-based migrations.

Placeholder app name throughout: `asset-registry` — substitute yours.

---

## The app at a glance

| Item | Value |
|---|---|
| **App name** | `asset-registry` (choose at create time) |
| **Region** | `osc-fr1` |
| **URL** | `https://asset-registry.osc-fr1.scalingo.io` |
| **Stack** | SvelteKit (adapter-node) + PostgreSQL |
| **Buildpack** | Node (auto-detected — no `.buildpacks` file needed) |
| **Process** | `Procfile` → `web: npm start` |
| **Node version** | pinned in `package.json` `engines` (`>=22 <25`) |
| **PG extensions** | `pgcrypto` only (no pgvector needed) |

**Known limitations of a Scalingo deploy (accepted for demo):**
- **Uploaded documents are ephemeral** — the container filesystem resets on
  every deploy/restart. Rows in Postgres survive; the files don't. Real
  fix later: S3-compatible object storage.
- **The document store is not deployed** — the `document-store` connector
  points at localhost. Findings work fully (creation is best-effort by
  design); the description editor won't load. Deploy the doc-store as a
  second app later and update the connector row if needed.

---

## First deploy from zero

Steps 1–3 create billed resources — run them yourself.

```bash
# 0. CLI up to date + logged in
brew upgrade scalingo   # doc was written against CLI 1.47
scalingo login

# 1. Create the app
scalingo create asset-registry --region osc-fr1

# 2. Postgres addon (starter plan is fine for the demo)
scalingo -a asset-registry addons-add postgresql postgresql-starter-512

# 3. Environment
scalingo -a asset-registry env-set \
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  BETTER_AUTH_URL="https://asset-registry.osc-fr1.scalingo.io" \
  ORIGIN="https://asset-registry.osc-fr1.scalingo.io" \
  API_TOKEN="$(openssl rand -hex 24)" \
  BODY_SIZE_LIMIT=52428800
# DATABASE_URL is set automatically by the addon (the app also reads
# SCALINGO_POSTGRESQL_URL as a fallback — either works).
# ⚠ BETTER_AUTH_URL and ORIGIN are REQUIRED in production. Wrong or missing
#   values = login returns 404/403 (origin-matching — learned the hard way).

# 4. Git remote + push (from the repo root)
git remote add scalingo git@ssh.osc-fr1.scalingo.com:asset-registry.git
git push scalingo main

# 5. Migrations (NOT auto-applied — see next section)
# 6. First admin user (see "Bootstrap the first admin")
```

If push fails with permission denied:

```bash
scalingo keys-add "$(hostname)" ~/.ssh/id_ed25519.pub
```

---

## Applying migrations

Migrations are hand-written SQL in `migrations/*.sql`, applied **manually**
after deploy — never automatically. You own the state.

One-off container + Scalingo's tool fetcher (the Node image has no psql;
`dbclient-fetcher` downloads it in ~5 s):

```bash
scalingo -a asset-registry run bash
# inside the container:
dbclient-fetcher pgsql
npm run db:migrate        # runs the full psql chain against $DATABASE_URL
exit
```

Single migration instead of the chain:

```bash
scalingo -a asset-registry run 'dbclient-fetcher pgsql && psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/016_auth.sql'
```

Seeds (optional, demo data — remember seeds bypass the write service):

```bash
scalingo -a asset-registry run 'dbclient-fetcher pgsql && npm run db:seed && npm run db:seed:008 && npm run db:seed:010 && npm run db:seed:011 && npm run db:seed:012 && npm run db:seed:013'
```

---

## Bootstrap the first admin

`scripts/create-user.mjs` needs Vite (a devDependency) — it does NOT run in
the production container. Use the API-token path instead: the sign-up route
accepts `Authorization: Bearer $API_TOKEN` (hooks.server.ts), then promote
the account via SQL.

```bash
APP=https://asset-registry.osc-fr1.scalingo.io
TOKEN=$(scalingo -a asset-registry env | awk -F= '/^API_TOKEN=/{print $2}')

# 1. Create the account (bootstrap-token sign-up)
curl -sS -X POST "$APP/api/auth/sign-up/email" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"<strong-password>","name":"Your Name"}'

# 2. Promote to admin
scalingo -a asset-registry run 'dbclient-fetcher pgsql && psql "$DATABASE_URL" -c "UPDATE auth_user SET role='"'"'admin'"'"' WHERE email='"'"'you@example.com'"'"'"'

# 3. Sign in at $APP/login — then create further users via the Users page.
```

New accounts default to `viewer`; promote via **Users** in the app.

---

## Making API calls (curl pattern)

Session-cookie flow (Better Auth):

```bash
APP=https://asset-registry.osc-fr1.scalingo.io
COOKIE=$(mktemp)
curl -s -c "$COOKIE" -X POST "$APP/api/auth/sign-in/email" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"…"}' -o /dev/null
curl -s -b "$COOKIE" "$APP/api/assets?search=P-407" | python3 -m json.tool
```

Script/CI flow (no session — acts as role `user`, actor `api-token`):

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$APP/api/assets?search=P-407"
```

Probe (no health endpoint yet): anonymous `GET /` returns **303 → /login**
when healthy; `GET /login` returns **200**.

---

## Deploying updates

```bash
git push scalingo main                 # build + boot automatically
# then, if the release includes new migrations/*.sql:
scalingo -a asset-registry run 'dbclient-fetcher pgsql && npm run db:migrate'
```

Force a rebuild (stale cache):

```bash
git commit --allow-empty -m "force rebuild" && git push scalingo main
```

Rollback:

```bash
scalingo -a asset-registry deployments
scalingo -a asset-registry deployment-rollback <deployment-id>
```

---

## Logs / env / restart / scale

```bash
scalingo -a asset-registry logs --follow
scalingo -a asset-registry logs -n 500 | grep -iE 'error|exception'
scalingo -a asset-registry env
scalingo -a asset-registry env-set KEY=value      # triggers a restart
scalingo -a asset-registry restart
scalingo -a asset-registry scale web:1:M
scalingo -a asset-registry ps
```

---

## Database access

Scalingo Postgres is not publicly exposed. Three paths:

**1 — from inside a one-off container** (fastest for one-offs):

```bash
scalingo -a asset-registry run 'dbclient-fetcher pgsql && psql "$DATABASE_URL" -c "SELECT count(*) FROM asset"'
```

**2 — SSH tunnel for psql / GUI clients** (TablePlus, DBeaver…):

```bash
# terminal 1 (keep open)
scalingo -a asset-registry db-tunnel DATABASE_URL
# → prints 127.0.0.1:10000

# terminal 2 — same user/password/dbname as DATABASE_URL, localhost:10000,
# and sslmode=disable (the tunnel already encrypts; 'require' FAILS here)
psql "postgresql://<user>:<password>@127.0.0.1:10000/<dbname>?sslmode=disable"
```

**3 — browser psql console**: dashboard → Resources → PostgreSQL → Console,
or `scalingo -a asset-registry pgsql-console`.

Backups:

```bash
scalingo -a asset-registry backups-create
scalingo -a asset-registry backups
scalingo -a asset-registry backups-download <backup-id>
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login returns **404** | `BETTER_AUTH_URL` missing/wrong — the auth handler origin-matches | `env-set BETTER_AUTH_URL=https://<exact-public-url>` |
| Login returns **403** on sign-in | Origin/CSRF mismatch (`ORIGIN` unset behind proxy) | `env-set ORIGIN=https://<exact-public-url>` |
| Every page redirects to /login after deploy | Migrations 016 not applied (no auth tables) → getSession throws | Apply migrations, check logs |
| "Application error" / white page | Boot failure — usually missing `BETTER_AUTH_SECRET` | `scalingo logs -n 200` |
| Uploaded files disappeared | Ephemeral filesystem — expected on restart/deploy | Accept for demo, or move to object storage |
| psql: command not found (one-off) | Node image has no PG tools | Run `dbclient-fetcher pgsql` first |
| Deploy OK but UI stale | Build cache | Empty commit + push |
| Can't push (permission denied) | SSH key not registered | `scalingo keys-add "$(hostname)" ~/.ssh/id_ed25519.pub` |

---

## Security notes

- Never commit real passwords into runbooks (the COMEX doc this is based on
  carried a live admin password — rotate any credential that lands in a doc
  or a chat).
- `BETTER_AUTH_SECRET` and `API_TOKEN` live only in Scalingo env vars and
  your local `.env` (gitignored). Rotate with `env-set` (auto-restarts).
- Sign-up is invite-only: the public route requires an admin session or the
  bearer token. Rate limiting on auth endpoints is on by default in prod.
