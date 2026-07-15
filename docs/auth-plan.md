# Authentication — plan (v3.4 candidate)

*Goal: protect the app when it's hosted, and — just as valuable — put real
names in the audit trail. Every write already carries an `actor` through the
write service; today it says `system`. With auth it says `j.breysse`.*

## Three ways to read "basic authentication"

| Option | What it is | Effort | Verdict |
|---|---|---|---|
| **A. HTTP Basic** | One shared password at the door (browser popup). No users, no UI. | 30 min | Stopgap only — no per-user identity, audit stays anonymous, ugly UX. Fine to gate a hosted demo *this week*. |
| **B. Own session auth** ⭐ | `app_user` + `session` tables, password login, cookie sessions, login page. ~250 lines, zero new dependencies (Node's built-in scrypt). | ~1 day | **Recommended.** Fits the repo's hand-rolled style (validation, rules). Full control, no framework churn, easy to explain in a security review. |
| **C. Better Auth (library)** | The framework originally pencilled in v1. Email/password + sessions + plugins (OAuth, 2FA…). | ~1 day + dep | Right choice *if* SSO/OIDC is coming soon. Otherwise it's a dependency with opinions we mostly won't use. |

Recommendation: **B now**; revisit C/OIDC when a real customer asks for SSO
(they will, eventually — enterprise DD teams live in Azure AD. That's v4.x,
and session auth migrates to it cleanly because the guard point won't move).

## Design (option B)

### Schema — migration 016

```sql
CREATE TABLE app_user (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,          -- scrypt, per-user salt
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('admin', 'member')),
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE session (
  token_hash  TEXT PRIMARY KEY,          -- sha256 of the cookie token
  user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip          TEXT, user_agent TEXT
);
```

Only the SHA-256 of the session token is stored — a DB leak doesn't yield
usable cookies. 30-day sliding expiry; expired rows deleted opportunistically
on validation.

### Server — `src/lib/server/auth.ts`

- `hashPassword` / `verifyPassword` — `node:crypto` scrypt + `timingSafeEqual`.
- `createSession(userId)` → random 32-byte token → cookie
  (`httpOnly`, `sameSite=lax`, `secure` in prod, 30 d).
- `validateSession(token)` → user or null (+ sliding renewal).
- Login rate limit: small in-memory counter per email/IP (single-node app —
  good enough; note it in the security README section).

### The guard — one place, `hooks.server.ts`

The audit-log hook already intercepts everything; auth slots in front of it:

1. Resolve cookie → `event.locals.user`.
2. Public: `/login` + static assets. Everything else:
   - page request, no user → redirect `/login?to=<path>`
   - `/api/*`, no user → 401 JSON
3. Script access (demo:p407 checklist, future CI) — `Authorization: Bearer
   $API_TOKEN` checked against an env var; identifies as actor `api-token`.
4. Mutating `/api/*` requests: verify `Origin` is same-site (CSRF belt +
   braces on top of `sameSite=lax`).
5. Bonus: the audit log gains a `user` column — every request row now says
   who.

### The payoff — real actors everywhere

`locals.user.email` replaces the hardcoded strings:

| Today | After |
|---|---|
| asset history: `created \| system` | `created \| j.breysse@…` |
| import batches: `import` | `import (j.breysse@…)` |
| finding `raised_by`: null | the logged-in user |
| finding transitions `by_user`: null | the logged-in user |

The write service API doesn't change — handlers just pass a real actor at
last. This is the "regulator story" clicking into place.

### UI

- `/login` — email + password, error state, redirect to `?to=`.
- Nav — user chip (initials) + Logout, right of the ⌘K hint.
- User management v1 = **a script, not a page**: `scripts/create-user.mjs
  email name [--admin]` prints a generated password (same ssrLoadModule
  pattern as seed-p407). Admin page comes later if needed.
- Role enforcement v1 (minimal): `admin` required for asset-type,
  connector, and user mutations; everything else = any signed-in user.

### Out of scope (explicitly)

Self-signup (users are invited), password reset by email (no mailer — admin
resets via script), MFA, SSO/OIDC (v4.x), multi-tenancy, per-asset
permissions (confidentiality stays a label for now — enforcing it per-role
is a meaningful later feature, not a footnote).

## Order of work (~1 day)

1. Migration 016 + auth.ts + create-user script — **2.5 h**
2. hooks guard + locals + API token path — **1.5 h**
3. /login + logout + nav chip — **1.5 h**
4. Actor wiring (asset routes, import, findings routes) + audit user column — **1.5 h**
5. Smoke: login/logout, 401s, script token, real actor in history; update
   demo docs — **1 h**

## Open questions

1. Stopgap needed? If the app goes on a public URL before this builds, I can
   add HTTP Basic at the hook level in 30 minutes and remove it when B lands.
2. Session length — 30 days sliding OK, or shorter for the demo posture?
3. Should `viewer` (read-only) exist from day one? Cheap now (one more role +
   guard on mutating routes), annoying to retrofit. My lean: yes, add it —
   "give the lender read-only access" is a likely demo ask.
