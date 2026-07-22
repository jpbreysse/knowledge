import type { PageServerLoad } from './$types';
import { activeDirectTypes } from '$lib/server/finding-vocab';

export const load: PageServerLoad = async () => {
	// Empty array = no domain vocabulary loaded → the page renders the exact
	// legacy form (inspection, no picker).
	return { types: await activeDirectTypes() };
};
