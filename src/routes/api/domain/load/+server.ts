import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadDomainVersion } from '$lib/server/rule-loader';

/** POST { domain?, version } — pull a published bundle and (re)load its
 *  transaction rules. Admin-only (enforced in hooks.server.ts). */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as {
		domain?: unknown;
		version?: unknown;
	} | null;
	const domain = typeof body?.domain === 'string' && body.domain ? body.domain : 'lie';
	const version =
		body?.version === 'latest' || body?.version === undefined
			? ('latest' as const)
			: Number(body?.version);
	if (version !== 'latest' && (!Number.isFinite(version) || version < 1))
		return json({ errors: { version: 'must be a positive integer or "latest"' } }, { status: 400 });

	try {
		const result = await loadDomainVersion(domain, version);
		return json(result);
	} catch (e) {
		return json({ errors: { _root: (e as Error).message } }, { status: 502 });
	}
};
