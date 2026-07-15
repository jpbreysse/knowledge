import { createAuthClient } from 'better-auth/svelte';
import { adminClient } from 'better-auth/client/plugins';

/** Browser-side Better Auth client — login page, logout button, /admin/users. */
export const authClient = createAuthClient({
	plugins: [adminClient()]
});

export type Role = 'admin' | 'user' | 'viewer';

/** UI gating only — the server (hooks.server.ts) is the source of truth. */
export function canWrite(role: Role | undefined | null): boolean {
	return role === 'admin' || role === 'user';
}

export function isAdmin(role: Role | undefined | null): boolean {
	return role === 'admin';
}
