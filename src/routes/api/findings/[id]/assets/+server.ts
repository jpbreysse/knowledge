import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { linkAsset, getAssetLinks } from '$lib/server/findings';
import { validateLinkAsset } from '$lib/server/findings-validation';

export const GET: RequestHandler = async ({ params }) => {
	return json(await getAssetLinks(params.id!));
};

export const POST: RequestHandler = async ({ params, request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = validateLinkAsset(body);
	if (!parsed.ok) {
		return json({ error: 'Validation failed', issues: parsed.issues }, { status: 400 });
	}
	// The FK now guarantees integrity — a null result means the asset isn't in
	// the register (the old cross-DB bridge would have accepted it silently).
	const link = await linkAsset(params.id!, parsed.value.asset_id);
	if (!link) {
		return json(
			{ error: 'Validation failed', issues: [{ path: 'asset_id', message: 'asset not found in register' }] },
			{ status: 400 }
		);
	}
	return json(link, { status: 201 });
};
