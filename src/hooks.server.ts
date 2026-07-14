import type { Handle } from '@sveltejs/kit';
import { sqlClient } from '$lib/server/db';

// Append-only HTTP access log for /api/* — ported from the findings app.
// Fire-and-forget: an audit insert must never break a response.
export const handle: Handle = async ({ event, resolve }) => {
	const start = performance.now();
	const response = await resolve(event);
	const duration = Math.round(performance.now() - start);

	const path = event.url.pathname;
	if (path.startsWith('/api/')) {
		const method = event.request.method;
		const status = response.status;
		const ip =
			event.getClientAddress?.() ?? event.request.headers.get('x-forwarded-for') ?? null;
		const ua = event.request.headers.get('user-agent') ?? null;
		const cl = event.request.headers.get('content-length');
		const bodySize = cl ? Number(cl) : null;

		sqlClient`
			INSERT INTO audit_log (method, path, status, duration_ms, ip, user_agent, body_size)
			VALUES (${method}, ${path}, ${status}, ${duration}, ${ip}, ${ua}, ${bodySize})
		`.catch((e) => {
			console.error('audit log insert failed:', e);
		});
	}

	return response;
};
