import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAssessmentsFor } from '$lib/server/assets';
import { isUuid } from '$lib/server/validation';

export const GET: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	return json(await listAssessmentsFor(params.id));
};
