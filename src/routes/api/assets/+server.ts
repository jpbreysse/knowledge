import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAssets } from '$lib/server/assets';
import { createAsset } from '$lib/server/asset-service';

const DEFAULT_ACTOR = 'system';

export const GET: RequestHandler = async ({ url }) => {
	const p = url.searchParams;
	const rows = await listAssets({
		search: p.get('search'),
		classCode: p.get('class_code'),
		conditionRating: p.get('condition_rating'),
		sort: (p.get('sort') as 'tag') ?? 'tag',
		dir: (p.get('dir') as 'asc' | 'desc') ?? 'asc'
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
