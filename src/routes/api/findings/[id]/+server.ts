import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import {
	getFinding,
	getAssetLinks,
	getDocumentLinks,
	updateFinding,
	deleteFinding
} from '$lib/server/findings';
import { validateUpdateFinding } from '$lib/server/findings-validation';

export const GET: RequestHandler = async ({ params }) => {
	const finding = await getFinding(params.id!);
	if (!finding) throw error(404, 'Not found');
	const [assets, documents] = await Promise.all([
		getAssetLinks(finding.id),
		getDocumentLinks(finding.id)
	]);
	return json({ ...finding, assets, documents });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = validateUpdateFinding(body);
	if (!parsed.ok) {
		return json({ error: 'Validation failed', issues: parsed.issues }, { status: 400 });
	}
	const updated = await updateFinding(params.id!, {
		...parsed.value,
		updated_by: parsed.value.updated_by ?? locals.user?.email ?? null
	});
	if (!updated) throw error(404, 'Not found');
	return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const ok = await deleteFinding(params.id!);
	if (!ok) throw error(404, 'Not found');
	return new Response(null, { status: 204 });
};
