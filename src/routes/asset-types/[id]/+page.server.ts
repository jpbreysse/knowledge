import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { countAssetsForClassCode, getAssetClass } from '$lib/server/asset-classes';
import { isUuid } from '$lib/server/validation';

export const load: PageServerLoad = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const klass = await getAssetClass(params.id);
	if (!klass) throw error(404, 'not found');
	const usage = await countAssetsForClassCode(klass.code);
	return { klass, usage };
};
