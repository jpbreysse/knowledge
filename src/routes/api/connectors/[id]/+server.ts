import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { connector } from '$lib/server/db/schema';
import { connectorHasLinkedDocs, getConnector } from '$lib/server/connectors';
import { isUuid, validateConnectorPatch } from '$lib/server/validation';

export const GET: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const row = await getConnector(params.id);
	if (!row) throw error(404, 'not found');
	return json(row);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const body = await request.json().catch(() => null);
	const parsed = validateConnectorPatch(body);
	if (!parsed.ok) return json({ errors: parsed.errors }, { status: 400 });
	if (Object.keys(parsed.value).length === 0)
		return json({ errors: { _root: 'no fields to update' } }, { status: 400 });

	try {
		const [row] = await db
			.update(connector)
			.set(parsed.value)
			.where(eq(connector.id, params.id))
			.returning();
		if (!row) throw error(404, 'not found');
		return json(row);
	} catch (e) {
		if (e instanceof Response) throw e;
		const info = pgErrorInfo(e);
		if (info.code === '23505') return json({ errors: { name: 'name already exists' } }, { status: 409 });
		if (info.constraint === 'connector_name_check')
			return json({ errors: { name: 'invalid slug format' } }, { status: 400 });
		if (info.constraint === 'connector_base_url_check')
			return json({ errors: { base_url: 'must start with http:// or https://' } }, { status: 400 });
		if (info.constraint === 'connector_link_template_check')
			return json({ errors: { link_template: 'must contain {id}' } }, { status: 400 });
		console.error('connector update failed', e);
		throw error(500, 'update failed');
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

export const DELETE: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	if (await connectorHasLinkedDocs(params.id))
		return json(
			{ error: 'connector still referenced by linked documents' },
			{ status: 409 }
		);
	const result = await db.delete(connector).where(eq(connector.id, params.id)).returning();
	if (result.length === 0) throw error(404, 'not found');
	return new Response(null, { status: 204 });
};
