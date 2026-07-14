import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getAsset,
	getVersionChain,
	listAssessmentsFor,
	listDocumentsFor,
	listHistoryFor,
	siteAssetIdFor
} from '$lib/server/assets';
import { listAssetClasses } from '$lib/server/asset-classes';
import { collectRefIds, resolveAssetRefs } from '$lib/server/asset-refs';
import { listConnectors } from '$lib/server/connectors';
import { linksForAsset } from '$lib/server/entity-links';
import { findingsForAsset, precedentsForAsset } from '$lib/server/findings';
import { isUuid } from '$lib/server/validation';

export const load: PageServerLoad = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const asset = await getAsset(params.id);
	if (!asset) throw error(404, 'not found');
	const [documents, history, assessments, enabledConnectors, findings, siteAssetId, assetClasses, versionChain, entityLinks] =
		await Promise.all([
			listDocumentsFor(params.id),
			listHistoryFor(params.id, 50),
			listAssessmentsFor(params.id),
			listConnectors({ enabledOnly: true }),
			findingsForAsset(params.id, 10),
			siteAssetIdFor(params.id),
			listAssetClasses(),
			getVersionChain(params.id),
			linksForAsset(params.id)
		]);
	const precedents = await precedentsForAsset(asset.classCode, siteAssetId, 5);
	const assetClass = assetClasses.find((c) => c.code === asset.classCode) ?? null;

	// Resolve every ref/array_ref value declared by the class to a display chip.
	const refIds = assetClass
		? collectRefIds(assetClass.attributeFields, asset.attributes as Record<string, unknown>)
		: [];
	const refLookupMap = await resolveAssetRefs(refIds);
	const refLookup = Object.fromEntries(refLookupMap);

	return {
		asset,
		documents,
		history,
		assessments,
		enabledConnectors,
		findings,
		precedents,
		assetClasses,
		assetClass,
		refLookup,
		versionChain,
		entityLinks
	};
};
