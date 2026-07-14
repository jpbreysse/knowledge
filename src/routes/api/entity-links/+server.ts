import { json, error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { asset, entityLink } from '$lib/server/db/schema';
import { ENTITY_LINK_RELATIONS } from '$lib/server/entity-links';
import { isUuid } from '$lib/server/validation';

const DEFAULT_ACTOR = 'system';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as {
		source_id?: unknown;
		target_id?: unknown;
		relation_type?: unknown;
	} | null;

	if (!body || typeof body !== 'object')
		return json({ errors: { _root: 'body must be an object' } }, { status: 400 });

	const errors: Record<string, string> = {};
	const source_id = typeof body.source_id === 'string' ? body.source_id : '';
	const target_id = typeof body.target_id === 'string' ? body.target_id : '';
	const relation_type = typeof body.relation_type === 'string' ? body.relation_type : 'participates_in';

	if (!isUuid(source_id)) errors.source_id = 'must be UUID';
	if (!isUuid(target_id)) errors.target_id = 'must be UUID';
	if (source_id && target_id && source_id === target_id)
		errors._root = 'cannot link an asset to itself';
	if (!ENTITY_LINK_RELATIONS.includes(relation_type as (typeof ENTITY_LINK_RELATIONS)[number]))
		errors.relation_type = `must be one of ${ENTITY_LINK_RELATIONS.join(', ')}`;

	if (Object.keys(errors).length > 0) return json({ errors }, { status: 400 });

	// Verify both endpoints exist.
	const rows = await db
		.select({ id: asset.id })
		.from(asset)
		.where(inArray(asset.id, [source_id, target_id]));
	const seen = new Set(rows.map((r) => r.id));
	if (!seen.has(source_id)) return json({ errors: { source_id: 'asset not found' } }, { status: 400 });
	if (!seen.has(target_id)) return json({ errors: { target_id: 'asset not found' } }, { status: 400 });

	try {
		const [row] = await db
			.insert(entityLink)
			.values({
				sourceId: source_id,
				targetId: target_id,
				relationType: relation_type,
				createdBy: DEFAULT_ACTOR
			})
			.returning();
		return json(row, { status: 201 });
	} catch (e) {
		const info = pgErrorInfo(e);
		if (info.code === '23505')
			return json({ errors: { _root: 'this link already exists' } }, { status: 409 });
		console.error('entity_link insert failed', e);
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
			return { code: o.code as string | undefined, constraint: o.constraint_name as string | undefined };
		}
		cur = o.cause ?? o.original ?? null;
	}
	return {};
}
