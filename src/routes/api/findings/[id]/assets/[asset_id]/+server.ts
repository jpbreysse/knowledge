import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { unlinkAsset } from '$lib/server/findings';

export const DELETE: RequestHandler = async ({ params }) => {
	const ok = await unlinkAsset(params.id!, params.asset_id!);
	if (!ok) throw error(404, 'Link not found');
	return new Response(null, { status: 204 });
};
