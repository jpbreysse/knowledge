import type { PageServerLoad } from './$types';
import { listAssetClasses } from '$lib/server/asset-classes';

export const load: PageServerLoad = async () => {
	return { assetClasses: await listAssetClasses() };
};
