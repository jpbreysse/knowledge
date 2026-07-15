import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAssets } from '$lib/server/assets';
import { createAsset } from '$lib/server/asset-service';
import { getAssetClassByCode } from '$lib/server/asset-classes';
import { parseAttrQuery } from '$lib/server/attr-query';

const DEFAULT_ACTOR = 'system';

export const GET: RequestHandler = async ({ url }) => {
	const p = url.searchParams;
	const classCode = p.get('class_code');
	const classDef = classCode ? await getAssetClassByCode(classCode) : null;

	// Structured attribute filters (attr.<field>[.<op>]=value) — strict on
	// the API: an unknown field or bad value is a 400, never a silent no-op.
	const attrQuery = parseAttrQuery(p, classDef);
	if (attrQuery.errors.length > 0)
		return json({ errors: { attr: attrQuery.errors } }, { status: 400 });

	const rows = await listAssets({
		search: p.get('search'),
		classCode,
		conditionRating: p.get('condition_rating'),
		sort: (p.get('sort') as 'tag') ?? 'tag',
		dir: (p.get('dir') as 'asc' | 'desc') ?? 'asc',
		extraConds: attrQuery.conds
	});
	return json(rows);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	let result;
	try {
		result = await createAsset(body, DEFAULT_ACTOR);
	} catch {
		throw error(500, 'insert failed');
	}
	if (!result.ok) return json({ errors: result.errors }, { status: result.status });
	return json(result.row, { status: 201 });
};
