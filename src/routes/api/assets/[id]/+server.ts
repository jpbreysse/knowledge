import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { asset } from '$lib/server/db/schema';
import { getAsset, hasChildren } from '$lib/server/assets';
import { updateAsset } from '$lib/server/asset-service';
import { isUuid } from '$lib/server/validation';

const DEFAULT_ACTOR = 'system';

export const GET: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const row = await getAsset(params.id);
	if (!row) throw error(404, 'not found');
	return json(row);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const body = await request.json().catch(() => null);
	const result = await updateAsset(params.id, body, DEFAULT_ACTOR);
	if (!result.ok) {
		if (result.status === 404) throw error(404, 'not found');
		return json({ errors: result.errors }, { status: result.status });
	}
	return json(result.row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	if (await hasChildren(params.id))
		return json({ error: 'asset has children — delete or re-parent them first' }, { status: 409 });
	try {
		const rows = await db.delete(asset).where(eq(asset.id, params.id)).returning({ id: asset.id });
		if (rows.length === 0) throw error(404, 'not found');
		return new Response(null, { status: 204 });
	} catch (e) {
		const msg = (e as { message?: string })?.message ?? '';
		if (msg.includes('asset_parent_id_fkey'))
			return json(
				{ error: 'asset is referenced as parent by other assets' },
				{ status: 409 }
			);
		throw e;
	}
};
