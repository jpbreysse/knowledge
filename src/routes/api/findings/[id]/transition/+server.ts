import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { transitionFinding } from '$lib/server/findings';
import { validateTransition } from '$lib/server/findings-validation';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = validateTransition(body);
	if (!parsed.ok) {
		return json({ error: 'Validation failed', issues: parsed.issues }, { status: 400 });
	}
	const f = await transitionFinding(
		params.id!,
		parsed.value.to_status,
		parsed.value.by_user ?? locals.user?.email ?? null
	);
	if (!f) throw error(404, 'Not found');
	return json(f);
};
