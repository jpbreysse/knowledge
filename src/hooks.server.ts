import type { Handle } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { auth, roleOf } from '$lib/server/auth';
import { sqlClient } from '$lib/server/db';

/**
 * Request pipeline (docs/auth-plan.md):
 *   1. /api/auth/* → Better Auth (with the public sign-up route locked to
 *      admins/bootstrap token — accounts are invited, never self-created)
 *   2. principal resolution — bearer API_TOKEN (scripts/CI, acts as role
 *      'user') or session cookie → event.locals.user
 *   3. role guard — anonymous: pages redirect to /login, APIs 401;
 *      viewer: GET-only; connectors mutations + /admin: admin-only
 *   4. audit log for /api/* (pre-existing), now with user attribution
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isPublic(pathname: string): boolean {
	return pathname === '/login' || pathname.startsWith('/login/');
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	event.locals.user = null;

	// --- 1. Better Auth routes ---------------------------------------------
	if (pathname.startsWith('/api/auth')) {
		if (pathname.startsWith('/api/auth/sign-up')) {
			const bearer = event.request.headers.get('authorization');
			const bootstrap = !!env.API_TOKEN && bearer === `Bearer ${env.API_TOKEN}`;
			let isAdmin = false;
			if (!bootstrap) {
				const session = await auth.api.getSession({ headers: event.request.headers });
				isAdmin = !!session && roleOf(session.user) === 'admin';
			}
			if (!bootstrap && !isAdmin) {
				return json({ error: 'sign-up is invite-only — ask an admin' }, { status: 403 });
			}
		}
		return svelteKitHandler({ auth, event, resolve, building });
	}

	// --- 2. Resolve the principal -------------------------------------------
	const bearer = event.request.headers.get('authorization');
	if (env.API_TOKEN && bearer === `Bearer ${env.API_TOKEN}`) {
		event.locals.user = { id: 'api-token', email: 'api-token', name: 'API token', role: 'user' };
	} else {
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (session?.user) {
			event.locals.user = {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
				role: roleOf(session.user)
			};
		}
	}
	const user = event.locals.user;

	// --- 3. Guard ------------------------------------------------------------
	if (!user && !isPublic(pathname) && !building) {
		if (pathname.startsWith('/api/')) {
			return json({ error: 'authentication required' }, { status: 401 });
		}
		const to = encodeURIComponent(pathname + event.url.search);
		redirect(303, `/login?to=${to}`);
	}
	if (user) {
		const mutating = MUTATING.has(event.request.method);
		if (mutating && pathname.startsWith('/api/') && user.role === 'viewer') {
			return json({ error: 'read-only role' }, { status: 403 });
		}
		if (mutating && pathname.startsWith('/api/connectors') && user.role !== 'admin') {
			return json({ error: 'admin role required' }, { status: 403 });
		}
		if (mutating && pathname.startsWith('/api/domain') && user.role !== 'admin') {
			return json({ error: 'admin role required' }, { status: 403 });
		}
		if (pathname.startsWith('/admin') && user.role !== 'admin') {
			if (pathname.startsWith('/api/')) return json({ error: 'admin role required' }, { status: 403 });
			redirect(303, '/');
		}
	}

	// --- 4. Serve + audit ------------------------------------------------------
	const start = performance.now();
	const response = await resolve(event);
	const duration = Math.round(performance.now() - start);

	if (pathname.startsWith('/api/')) {
		const method = event.request.method;
		const status = response.status;
		const ip =
			event.getClientAddress?.() ?? event.request.headers.get('x-forwarded-for') ?? null;
		const ua = event.request.headers.get('user-agent') ?? null;
		const cl = event.request.headers.get('content-length');
		const bodySize = cl ? Number(cl) : null;

		// Fire-and-forget: an audit insert must never break a response.
		sqlClient`
			INSERT INTO audit_log (method, path, status, duration_ms, ip, user_agent, body_size, user_email)
			VALUES (${method}, ${pathname}, ${status}, ${duration}, ${ip}, ${ua}, ${bodySize}, ${user?.email ?? null})
		`.catch((e) => {
			console.error('audit log insert failed:', e);
		});
	}

	return response;
};
