import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAssetClass } from '$lib/server/asset-classes';
import { renderTemplateCsv } from '$lib/server/import';
import { isUuid } from '$lib/server/validation';

export const GET: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const classDef = await getAssetClass(params.id);
	if (!classDef) throw error(404, 'asset class not found');

	return new Response(renderTemplateCsv(classDef), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="import-${classDef.code.toLowerCase()}.csv"`
		}
	});
};
