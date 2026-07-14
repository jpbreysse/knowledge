import type { PageServerLoad } from './$types';
import { getDashboardStats, getTopCriticalFindings } from '$lib/server/dashboard';

export const load: PageServerLoad = async () => {
	const [stats, topFindings] = await Promise.all([
		getDashboardStats(),
		getTopCriticalFindings(3)
	]);
	return { stats, topFindings };
};
