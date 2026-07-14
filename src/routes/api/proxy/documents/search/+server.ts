import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { callConnector, ConnectorError } from '$lib/server/connector-client';

interface DocumentRow {
	id: string;
	title: string;
}

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	try {
		const res = await callConnector('document-store', '/docs', {
			query: q ? { search: q } : undefined
		});
		if (!res.ok) {
			return json({ error: `Document store returned ${res.status}`, results: [] }, { status: 502 });
		}
		const raw = (await res.json()) as DocumentRow[];
		const filtered = q
			? raw.filter(
					(d) => d.title?.toLowerCase().includes(q.toLowerCase()) || d.id?.includes(q)
				)
			: raw;
		const results = filtered.slice(0, 20).map((d) => ({
			id: d.id,
			title: d.title || '(untitled)'
		}));
		return json({ results });
	} catch (e) {
		const msg = e instanceof ConnectorError ? e.message : 'Document store unavailable';
		return json({ error: msg, results: [] }, { status: 503 });
	}
};
