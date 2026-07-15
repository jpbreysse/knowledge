import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { authUser, authSession, authAccount, authVerification } from './db/auth-schema';

/**
 * Better Auth instance (docs/auth-plan.md).
 *
 * - email + password only; sign-up is invite-only (the PUBLIC route is
 *   blocked in hooks.server.ts — server-side calls from scripts still work,
 *   which is how create-user.mjs bootstraps accounts).
 * - Roles via the admin plugin: admin | user | viewer. New accounts default
 *   to viewer (least privilege); route enforcement lives in hooks.server.ts.
 * - Sessions: Better Auth defaults (7-day expiry, sliding refresh).
 */
export const auth = betterAuth({
	secret: env.BETTER_AUTH_SECRET,
	// Unset in dev → inferred per request (localhost and 127.0.0.1 both work).
	// Set BETTER_AUTH_URL explicitly in production (see .env.example).
	baseURL: env.BETTER_AUTH_URL || undefined,
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema: {
			user: authUser,
			session: authSession,
			account: authAccount,
			verification: authVerification
		}
	}),
	emailAndPassword: {
		enabled: true
	},
	user: { modelName: 'user' },
	plugins: [
		admin({
			defaultRole: 'viewer',
			adminRoles: ['admin']
		}),
		sveltekitCookies(getRequestEvent)
	]
});

export type Role = 'admin' | 'user' | 'viewer';

export type AppUser = {
	id: string;
	email: string;
	name: string;
	role: Role;
};

export function roleOf(sessionUser: { role?: string | null }): Role {
	const r = sessionUser.role;
	return r === 'admin' || r === 'user' ? r : 'viewer';
}
