import type { LayoutServerLoad } from './$types';
import { sqlClient } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ locals }) => {
	let pendingProposals = 0;
	if (locals.user) {
		const rows = await sqlClient<{ n: number }[]>`
			SELECT count(*)::int AS n FROM finding WHERE review_status = 'pending'`;
		pendingProposals = rows[0]?.n ?? 0;
	}
	return { user: locals.user, pendingProposals };
};
