import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getConnector } from '$lib/server/connectors';
import { isUuid } from '$lib/server/validation';

export const load: PageServerLoad = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const connector = await getConnector(params.id);
	if (!connector) throw error(404, 'not found');
	return { connector };
};
