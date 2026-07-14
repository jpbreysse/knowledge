import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { linkDocument, getDocumentLinks } from '$lib/server/findings';
import { validateLinkDocument } from '$lib/server/findings-validation';

export const GET: RequestHandler = async ({ params }) => {
	return json(await getDocumentLinks(params.id!));
};

export const POST: RequestHandler = async ({ params, request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = validateLinkDocument(body);
	if (!parsed.ok) {
		return json({ error: 'Validation failed', issues: parsed.issues }, { status: 400 });
	}
	const link = await linkDocument(
		params.id!,
		parsed.value.document_id,
		parsed.value.document_title ?? null
	);
	return json(link, { status: 201 });
};
