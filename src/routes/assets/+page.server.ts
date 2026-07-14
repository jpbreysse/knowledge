import type { PageServerLoad } from './$types';
import { listAssets } from '$lib/server/assets';

export const load: PageServerLoad = async ({ url }) => {
	const p = url.searchParams;
	const assets = await listAssets({
		search: p.get('search'),
		classCode: p.get('class_code'),
		conditionRating: p.get('condition_rating'),
		sort: (p.get('sort') as 'tag') ?? 'tag',
		dir: (p.get('dir') as 'asc' | 'desc') ?? 'asc'
	});
	return {
		assets,
		filters: {
			search: p.get('search') ?? '',
			classCode: p.get('class_code') ?? '',
			conditionRating: p.get('condition_rating') ?? '',
			sort: p.get('sort') ?? 'tag',
			dir: (p.get('dir') ?? 'asc') as 'asc' | 'desc'
		}
	};
};
