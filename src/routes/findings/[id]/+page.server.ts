import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getFinding, getAssetLinks, getDocumentLinks } from '$lib/server/findings';
import { sqlClient } from '$lib/server/db';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ params }) => {
	const finding = await getFinding(params.id);
	if (!finding) throw error(404, 'Finding not found');

	const [assets, documents, audit] = await Promise.all([
		getAssetLinks(finding.id),
		getDocumentLinks(finding.id),
		sqlClient`
			SELECT id, ts, method, path, status, duration_ms
			FROM audit_log
			WHERE path LIKE ${`%/findings/${finding.id}%`}
			ORDER BY ts DESC
			LIMIT 20
		`
	]);

	return {
		finding,
		assets,
		documents,
		audit,
		// The description editor still lives in the federated document store.
		docsAppBase: env.DOCS_APP_BASE ?? 'http://localhost:5173'
	};
};
