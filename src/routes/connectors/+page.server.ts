import type { PageServerLoad } from './$types';
import { listConnectors } from '$lib/server/connectors';

export const load: PageServerLoad = async () => {
	return { connectors: await listConnectors() };
};
