import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assetClass } from '$lib/server/db/schema';
import { countAssetsForClassCode, getAssetClass } from '$lib/server/asset-classes';
import { isUuid, validateAssetClassPatch } from '$lib/server/validation';

export const GET: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const row = await getAssetClass(params.id);
	if (!row) throw error(404, 'not found');
	return json(row);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const body = await request.json().catch(() => null);
	const parsed = validateAssetClassPatch(body);
	if (!parsed.ok) return json({ errors: parsed.errors }, { status: 400 });
	if (Object.keys(parsed.value).length === 0)
		return json({ errors: { _root: 'no fields to update' } }, { status: 400 });

	try {
		const [row] = await db
			.update(assetClass)
			.set(parsed.value)
			.where(eq(assetClass.id, params.id))
			.returning();
		if (!row) throw error(404, 'not found');
		return json(row);
	} catch (e) {
		if (e instanceof Response) throw e;
		const info = pgErrorInfo(e);
		if (info.code === '23505') return json({ errors: { code: 'code already exists' } }, { status: 409 });
		if (info.constraint === 'asset_class_code_check')
			return json({ errors: { code: 'invalid code format' } }, { status: 400 });
		if (info.constraint === 'asset_class_family_check')
			return json({ errors: { family: 'invalid family' } }, { status: 400 });
		if (info.constraint === 'asset_class_color_check')
			return json({ errors: { color: 'must be #RRGGBB' } }, { status: 400 });
		console.error('asset_class update failed', e);
		throw error(500, 'update failed');
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const row = await getAssetClass(params.id);
	if (!row) throw error(404, 'not found');
	const used = await countAssetsForClassCode(row.code);
	if (used > 0)
		return json(
			{ error: `still referenced by ${used} asset${used === 1 ? '' : 's'}` },
			{ status: 409 }
		);
	await db.delete(assetClass).where(eq(assetClass.id, params.id));
	return new Response(null, { status: 204 });
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
