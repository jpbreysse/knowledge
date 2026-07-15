# Authentication — plan v2 (Better Auth, 3 roles)

*Decision taken: Better Auth library (deployment-ready, SSO-capable later),
three roles — `admin`, `user`, `viewer`. Supersedes the hand-rolled option
in the first draft of this doc.*

## Why Better Auth fits the deployment goal

- Production-hardened session handling out of the box: secure cookies,
  CSRF protection, built-in rate limiting on auth endpoints (on by default
  in production), session revocation.
- **Growth path without rework**: when a customer asks for Azure AD / Google
  SSO, it's a plugin (`sso`, `oidc`), not a migration. Same for 2FA.
- First-class SvelteKit integration: one handler in `hooks.server.ts`
  mounts all `/api/auth/*` routes; a typed client for the login page.
- Admin plugin gives user management (create user, set role, ban/disable,
  list) without building an admin UI from scratch.

## Roles — capability matrix (to confirm)

| Capability | admin | user | viewer |
|---|---|---|---|
| Browse everything, ⌘K, graph/tree, export CSV | ✔ | ✔ | ✔ |
| Create/edit/delete **assets**, CSV import | ✔ | ✔ | — |
| Create/edit **asset types (classes)** | ✔ | ✔ | — |
| Findings: raise, edit, transition, link | ✔ | ✔ | — |
| Documents: upload, link, delete | ✔ | ✔ | — |
| Entity links: add/remove | ✔ | ✔ | — |
| Connectors config | ✔ | — | — |
| User management (create, role, disable) | ✔ | — | — |
| Audit page | ✔ | ✔ | ✔ (read-only anyway) |

Enforcement rule of thumb: **viewer = GET only** across `/api/*`;
**user = all domain writes**; **admin = user + connectors + user admin**.
Server-side enforcement is the source of truth; the UI additionally hides
buttons the role can't use (no dead ends).

## Build plan

### 1. Install + schema (½ day)

- `npm install better-auth`.
- Auth instance `src/lib/server/auth.ts`: `betterAuth()` with the
  **drizzle adapter** over the existing postgres.js client;
  `emailAndPassword` enabled; **admin plugin** with custom roles
  `admin | user | viewer` (default `viewer` — least privilege for new
  accounts); email verification off (no mailer — users are invited).
- Schema: generate the canonical DDL with `npx @better-auth/cli generate`,
  then hand-write **migration 016** to repo convention (4 tables: `user`,
  `session`, `account`, `verification` — Better Auth names, prefixed
  `auth_` via the adapter's table-name mapping to avoid colliding with our
  domain naming). Mirror in `schema.ts` for the adapter.
- `BETTER_AUTH_SECRET` + base-URL env vars added to `.env.example` with
  deployment notes (Scalingo: set `ORIGIN` for adapter-node, secure
  cookies behind the proxy are automatic).

### 2. Guard + session plumbing (2 h)

`hooks.server.ts` becomes a small pipeline (auth handler → session →
role guard → existing audit log):

1. Mount Better Auth's SvelteKit handler (`/api/auth/*`).
2. Resolve session → `event.locals.user` (`{ id, email, name, role }`).
3. **Sign-up lockdown**: the public sign-up route is blocked unless the
   caller is an admin or presents the bootstrap token (see §4) — invited
   users only, without forking Better Auth config.
4. Role guard, one central map:
   - no user → pages redirect `/login?to=…`, APIs 401;
   - `viewer` + non-GET `/api/*` → 403;
   - non-admin + (`/api/connectors*` mutations, user-admin routes) → 403.
5. `Authorization: Bearer $API_TOKEN` (env) for scripts/CI → acts as role
   `user`, actor `api-token` (keeps `npm run demo:p407` working).
6. Audit log gains a `user_email` column — every request row says who.

### 3. UI (3 h)

- `/login` — Better Auth svelte client (`signIn.email`), error states,
  `?to=` redirect. No sign-up link (invited only).
- Nav: user chip (initials + role badge) with Logout; `Connectors` and
  `Audit` links admin-gated where applicable.
- Role-aware rendering: viewer sees no New/Edit/Delete/Import/Raise
  buttons (one `can(user, 'write')` helper in `$lib`, driven by
  `+layout.server.ts` exposing `locals.user`).

### 4. Users bootstrap + management (2 h)

- `scripts/create-user.mjs email name role` — server-side via the auth
  instance (ssrLoadModule, same pattern as seed-p407); prints a generated
  password. First run creates the first admin using the bootstrap token
  path; after that, admin-only.
- `/admin/users` page (admin plugin client APIs): list, create, change
  role, disable. Small — the plugin does the work.

### 5. Actor wiring + smoke (2 h)

- `locals.user.email` replaces hardcoded actors: asset POST/PATCH
  (`system` → email), import commit (`import` → email), finding
  `raised_by` / transition `by_user` (null → email).
- Audit trail payoff: `created | j.breysse@…` in asset history; the
  regulator story becomes real.
- Smoke checklist: login/logout round trip; viewer 403 on POST; user can
  create asset+class but 403 on connectors; admin full; script token path;
  `demo:p407` green; history rows carry emails; build clean.

**Total: ~1.5 days.**

## Out of scope (explicit)

Self-signup, password reset by email (admin resets via script/page), MFA,
SSO/OIDC (plugin later — that's the point of choosing Better Auth), per-asset
permissions from the `confidentiality` label (meaningful later feature),
multi-tenancy.

## Open questions

1. **Capability matrix above — confirm?** Especially: `user` may edit
   *classes* (per your instruction) — but connectors stay admin-only, and
   viewer keeps CSV export (it's read-only). OK?
2. **New accounts default to `viewer`** (least privilege, admin promotes)?
3. **Session length** — Better Auth default 7 days sliding, or 30?
