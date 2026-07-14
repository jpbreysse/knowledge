import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { refreshDescriptionCache, getFinding } from '$lib/server/findings';

export const POST: RequestHandler = async ({ params }) => {
	const finding = await getFinding(params.id!);
	if (!finding) throw error(404, 'Not found');
	const html = await refreshDescriptionCache(params.id!);
	if (html === null) {
		return json({ error: 'Could not fetch description from document store' }, { status: 502 });
	}
	return json({ description_html: html, description_synced_at: new Date().toISOString() });
};
