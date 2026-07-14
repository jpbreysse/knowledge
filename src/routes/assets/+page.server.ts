import type { PageServerLoad } from './$types';
import { listAssets } from '$lib/server/assets';
import { listAssetClasses } from '$lib/server/asset-classes';

export const load: PageServerLoad = async ({ url }) => {
	const p = url.searchParams;
	const [assets, assetClasses] = await Promise.all([
		listAssets({
			search: p.get('search'),
			classCode: p.get('class_code'),
			conditionRating: p.get('condition_rating'),
			sort: (p.get('sort') as 'tag') ?? 'tag',
			dir: (p.get('dir') as 'asc' | 'desc') ?? 'asc'
		}),
		listAssetClasses()
	]);
	return {
		assets,
		// Live taxonomy for the class filter — NOT the legacy CLASS_CODES
		// constant, which predates admin-created classes.
		classCodes: assetClasses.filter((c) => c.enabled).map((c) => c.code),
		filters: {
			search: p.get('search') ?? '',
			classCode: p.get('class_code') ?? '',
			conditionRating: p.get('condition_rating') ?? '',
			sort: p.get('sort') ?? 'tag',
			dir: (p.get('dir') ?? 'asc') as 'asc' | 'desc'
		}
	};
};
