import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { sqlClient } from '$lib/server/db';
import { getFinding } from '$lib/server/findings';
import { callConnector, ConnectorError } from '$lib/server/connector-client';

/**
 * Idempotent: ensure this finding has a description document in the doc-store.
 * If it already does, return its id. Otherwise create one and persist the id.
 */
export const POST: RequestHandler = async ({ params }) => {
	const finding = await getFinding(params.id!);
	if (!finding) throw error(404, 'Finding not found');

	if (finding.description_doc_id) {
		return json({ description_doc_id: finding.description_doc_id, created: false });
	}

	const docId = crypto.randomUUID();
	try {
		const res = await callConnector('document-store', '/docs', {
			method: 'POST',
			body: {
				id: docId,
				content: { type: 'doc', content: [{ type: 'paragraph' }] },
				title: finding.title
			}
		});
		if (!res.ok) {
			return json({ error: `Document store rejected create (${res.status})` }, { status: 502 });
		}
	} catch (e) {
		const msg = e instanceof ConnectorError ? e.message : 'Document store unavailable';
		return json({ error: msg }, { status: 503 });
	}

	await sqlClient`
		UPDATE finding
		SET description_doc_id = ${docId}, updated_at = NOW()
		WHERE id = ${params.id!}
	`;

	return json({ description_doc_id: docId, created: true }, { status: 201 });
};
