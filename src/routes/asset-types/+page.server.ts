import type { PageServerLoad } from './$types';
import { assetCountByClass, listAssetClasses } from '$lib/server/asset-classes';

export const load: PageServerLoad = async () => {
	const [classes, counts] = await Promise.all([listAssetClasses(), assetCountByClass()]);
	return {
		classes: classes.map((c) => ({ ...c, usage: counts.get(c.code) ?? 0 }))
	};
};
