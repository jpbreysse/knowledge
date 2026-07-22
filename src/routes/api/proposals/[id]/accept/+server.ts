import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sqlClient as db } from '$lib/server/db';

/** Accept a pending proposal → becomes a visible, derived-marked finding. */
export const POST: RequestHandler = async ({ params, locals }) => {
	const rows = await db`
		UPDATE finding
		SET review_status = 'accepted',
		    reviewed_by = ${locals.user?.email ?? null},
		    reviewed_at = NOW(),
		    updated_at = NOW()
		WHERE id = ${params.id!} AND review_status = 'pending'
		RETURNING id
	`;
	if (rows.length === 0) throw error(404, 'no pending proposal with that id');
	return json({ ok: true, review_status: 'accepted' });
};
