import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { currentDomainState, listRules } from '$lib/server/rule-loader';
import { listTypeDefs } from '$lib/server/finding-vocab';
import { fetchVersions, ONTOLOGY_URL } from '$lib/server/ontology-client';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'admin') throw error(403, 'admin role required');

	const [state, rules, typeDefs] = await Promise.all([currentDomainState(), listRules(), listTypeDefs()]);

	// Version list is best-effort — the page must work when the ontology app
	// is down (loaded rules keep enforcing regardless).
	let versions: Awaited<ReturnType<typeof fetchVersions>> = [];
	let ontologyDown = false;
	try {
		versions = await fetchVersions('lie');
	} catch {
		ontologyDown = true;
	}

	return { state, rules, typeDefs, versions, ontologyDown, ontologyUrl: ONTOLOGY_URL };
};
