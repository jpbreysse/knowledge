import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { entityLink } from '$lib/server/db/schema';
import { isUuid } from '$lib/server/validation';

export const DELETE: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const rows = await db.delete(entityLink).where(eq(entityLink.id, params.id)).returning({ id: entityLink.id });
	if (rows.length === 0) throw error(404, 'not found');
	return new Response(null, { status: 204 });
};
