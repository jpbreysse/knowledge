import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assetClass } from '$lib/server/db/schema';
import { listAssetClasses } from '$lib/server/asset-classes';
import { validateAssetClass } from '$lib/server/validation';

export const GET: RequestHandler = async () => {
	return json(await listAssetClasses());
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const parsed = validateAssetClass(body);
	if (!parsed.ok) return json({ errors: parsed.errors }, { status: 400 });
	const v = parsed.value;

	try {
		const [row] = await db
			.insert(assetClass)
			.values({
				code: v.code,
				label: v.label,
				family: v.family,
				description: v.description,
				color: v.color,
				attributeFields: v.attributeFields,
				validLifecycleStates: v.validLifecycleStates,
				applicableTabs: v.applicableTabs,
				enabled: v.enabled
			})
			.returning();
		return json(row, { status: 201 });
	} catch (e) {
		const info = pgErrorInfo(e);
		if (info.code === '23505') return json({ errors: { code: 'code already exists' } }, { status: 409 });
		if (info.constraint === 'asset_class_code_check')
			return json({ errors: { code: 'invalid code format' } }, { status: 400 });
		if (info.constraint === 'asset_class_family_check')
			return json({ errors: { family: 'invalid family' } }, { status: 400 });
		if (info.constraint === 'asset_class_color_check')
			return json({ errors: { color: 'must be #RRGGBB' } }, { status: 400 });
		console.error('asset_class insert failed', e);
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
