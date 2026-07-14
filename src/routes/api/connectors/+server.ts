import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { connector } from '$lib/server/db/schema';
import { listConnectors } from '$lib/server/connectors';
import { validateConnector } from '$lib/server/validation';

export const GET: RequestHandler = async ({ url }) => {
	const enabledOnly = url.searchParams.get('enabled') === 'true';
	const rows = await listConnectors({ enabledOnly });
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const parsed = validateConnector(body);
	if (!parsed.ok) return json({ errors: parsed.errors }, { status: 400 });
	const v = parsed.value;

	try {
		const [row] = await db
			.insert(connector)
			.values({
				name: v.name,
				label: v.label,
				baseUrl: v.baseUrl,
				pathPrefix: v.pathPrefix,
				authType: v.authType,
				enabled: v.enabled,
				linkTemplate: v.linkTemplate
			})
			.returning();
		return json(row, { status: 201 });
	} catch (e) {
		const info = pgErrorInfo(e);
		if (info.code === '23505') return json({ errors: { name: 'name already exists' } }, { status: 409 });
		if (info.constraint === 'connector_name_check')
			return json({ errors: { name: 'invalid slug format' } }, { status: 400 });
		if (info.constraint === 'connector_base_url_check')
			return json({ errors: { base_url: 'must start with http:// or https://' } }, { status: 400 });
		if (info.constraint === 'connector_link_template_check')
			return json({ errors: { link_template: 'must contain {id}' } }, { status: 400 });
		console.error('connector insert failed', e);
		throw error(500, 'insert failed');
	}
};

function pgErrorInfo(e: unknown): { code?: string; constraint?: string } {
	const seen = new Set<unknown>();
	let cur: unknown = e;
	while (cur && typeof cur === 'object' && !seen.has(cur)) {
		seen.add(cur);
		const o = cur as Record<string, unknown>;
		if (typeof o.code === 'string' || typeof o.constraint_name === 'string') {
			return {
				code: o.code as string | undefined,
				constraint: o.constraint_name as string | undefined
			};
		}
		cur = o.cause ?? o.original ?? null;
	}
	return {};
}
