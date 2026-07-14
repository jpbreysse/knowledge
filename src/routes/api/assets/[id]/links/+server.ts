import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { linksForAsset } from '$lib/server/entity-links';
import { isUuid } from '$lib/server/validation';

export const GET: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	return json(await linksForAsset(params.id));
};
