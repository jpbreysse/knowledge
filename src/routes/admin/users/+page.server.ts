import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { sqlClient } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	// hooks.server.ts already gates /admin/* — this is belt and braces.
	if (locals.user?.role !== 'admin') throw error(403, 'admin role required');

	const users = await sqlClient<
		{
			id: string;
			email: string;
			name: string;
			role: string | null;
			banned: boolean | null;
			created_at: Date;
		}[]
	>`
		SELECT id, email, name, role, banned, created_at
		FROM auth_user
		ORDER BY created_at ASC
	`;
	return { users };
};
