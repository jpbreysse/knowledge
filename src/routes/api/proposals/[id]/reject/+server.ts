import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sqlClient as db } from '$lib/server/db';

/** Reject a pending proposal — hidden from lists, kept with its reason as
 *  the calibration signal. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
	const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;

	const rows = await db`
		UPDATE finding
		SET review_status = 'rejected',
		    review_reason = ${reason},
		    reviewed_by = ${locals.user?.email ?? null},
		    reviewed_at = NOW(),
		    updated_at = NOW()
		WHERE id = ${params.id!} AND review_status = 'pending'
		RETURNING id
	`;
	if (rows.length === 0) throw error(404, 'no pending proposal with that id');
	return json({ ok: true, review_status: 'rejected' });
};
