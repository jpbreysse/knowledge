import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConnector } from '$lib/server/connectors';
import { isUuid } from '$lib/server/validation';

/**
 * Server-side proxy that lists documents from the connector's document store.
 * Avoids CORS and hides the connector URL from the client.
 *
 * Contract on the document store side (verified against the local
 * `document-store` connector at http://localhost:3001/api/docs):
 *   GET <base_url><path_prefix>/docs[?search=<q>]
 *   → 200 [{id: uuid, title: string, ...}]   OR   {items: [...]}
 *
 * The `?search=` query is forwarded for forward-compatibility, but the current
 * doc store ignores it — the modal does client-side filtering on the returned
 * list.
 *
 * Returns: { items: [{id, title}], error?: string }
 *  - 200 + items[] on success (possibly empty if the store returned nothing)
 *  - 200 + items: [] + error on network / non-2xx — the modal renders the
 *    error inline rather than crashing the whole flow.
 */
export const GET: RequestHandler = async ({ params, url, fetch }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const conn = await getConnector(params.id);
	if (!conn) throw error(404, 'connector not found');
	if (!conn.enabled) throw error(400, 'connector is disabled');

	const q = url.searchParams.get('q')?.trim() ?? '';
	const baseUrl = conn.baseUrl.replace(/\/+$/, '');
	const prefix = (conn.pathPrefix ?? '').replace(/\/+$/, '');
	const target = `${baseUrl}${prefix}/docs${q ? `?search=${encodeURIComponent(q)}` : ''}`;

	let res: Response;
	try {
		res = await fetch(target, {
			signal: AbortSignal.timeout(5000),
			headers: { accept: 'application/json' }
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'network error';
		return json({ items: [], error: `connector unreachable: ${msg}` }, { status: 200 });
	}

	if (!res.ok) {
		return json(
			{ items: [], error: `connector returned ${res.status}` },
			{ status: 200 }
		);
	}

	let data: unknown;
	try {
		data = await res.json();
	} catch {
		return json({ items: [], error: 'connector returned non-JSON response' }, { status: 200 });
	}

	const raw: unknown[] = Array.isArray(data)
		? data
		: Array.isArray((data as { items?: unknown[] })?.items)
			? (data as { items: unknown[] }).items
			: [];

	const items = raw
		.map((r) => {
			if (!r || typeof r !== 'object') return null;
			const o = r as Record<string, unknown>;
			const id = typeof o.id === 'string' ? o.id : null;
			if (!id) return null;
			const title = typeof o.title === 'string' && o.title.length > 0 ? o.title : null;
			return { id, title };
		})
		.filter((x): x is { id: string; title: string | null } => x !== null);

	return json({ items });
};
