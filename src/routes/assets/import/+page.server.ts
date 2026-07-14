import type { PageServerLoad } from './$types';
import { listAssetClasses } from '$lib/server/asset-classes';

export const load: PageServerLoad = async ({ url }) => {
	return {
		assetClasses: await listAssetClasses(),
		preselect: url.searchParams.get('class') ?? ''
	};
};
