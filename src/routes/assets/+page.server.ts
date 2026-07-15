import type { PageServerLoad } from './$types';
import { listAssets } from '$lib/server/assets';
import { listAssetClasses } from '$lib/server/asset-classes';
import { parseAttrQuery } from '$lib/server/attr-query';
import { resolveAssetRefs } from '$lib/server/asset-refs';

export const load: PageServerLoad = async ({ url }) => {
	const p = url.searchParams;
	const assetClasses = await listAssetClasses();
	const classCode = p.get('class_code') ?? '';
	const classDef = classCode ? (assetClasses.find((c) => c.code === classCode) ?? null) : null;

	// Structured attribute filters. Lenient on the page (unlike the API):
	// invalid params surface as a banner, valid ones still apply.
	const attrQuery = parseAttrQuery(p, classDef);

	const assets = await listAssets({
		search: p.get('search'),
		classCode: classCode || null,
		conditionRating: p.get('condition_rating'),
		sort: (p.get('sort') as 'tag') ?? 'tag',
		dir: (p.get('dir') as 'asc' | 'desc') ?? 'asc',
		extraConds: attrQuery.conds
	});

	// Resolve ref-filter values to tags so chips read "P-407", not a UUID.
	const refIds = attrQuery.active
		.filter((a) => a.type === 'ref' || a.type === 'array_ref')
		.flatMap((a) => a.values);
	const refLookup = Object.fromEntries(await resolveAssetRefs(refIds));

	return {
		assets,
		// Live taxonomy for the class filter — NOT the legacy CLASS_CODES
		// constant, which predates admin-created classes.
		classCodes: assetClasses.filter((c) => c.enabled).map((c) => c.code),
		// Selected class's schema drives the filter builder ('object' excluded).
		classFields: (classDef?.attributeFields ?? []).filter((f) => f.type !== 'object'),
		attrActive: attrQuery.active,
		attrErrors: attrQuery.errors,
		refLookup,
		filters: {
			search: p.get('search') ?? '',
			classCode,
			conditionRating: p.get('condition_rating') ?? '',
			sort: p.get('sort') ?? 'tag',
			dir: (p.get('dir') ?? 'asc') as 'asc' | 'desc'
		}
	};
};
