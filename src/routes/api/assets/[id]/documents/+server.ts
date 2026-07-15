import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assetDocument } from '$lib/server/db/schema';
import { getAsset, listDocumentsFor } from '$lib/server/assets';
import { getConnector } from '$lib/server/connectors';
import { saveUpload } from '$lib/server/uploads';
import { isUuid, validateLinkDocument } from '$lib/server/validation';

const DEFAULT_ACTOR = 'system';

export const GET: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	return json(await listDocumentsFor(params.id));
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!isUuid(params.id)) throw error(400, 'invalid id');
	const parent = await getAsset(params.id);
	if (!parent) throw error(404, 'asset not found');

	const ct = request.headers.get('content-type') ?? '';

	// JSON body → link-from-connector path (no file bytes).
	if (ct.startsWith('application/json')) {
		const body = await request.json().catch(() => null);
		const parsed = validateLinkDocument(body);
		if (!parsed.ok) return json({ errors: parsed.errors }, { status: 400 });

		const connector = await getConnector(parsed.value.connectorId);
		if (!connector)
			return json({ errors: { connector_id: 'connector not found' } }, { status: 400 });
		if (!connector.enabled)
			return json({ errors: { connector_id: 'connector is disabled' } }, { status: 400 });

		const [row] = await db
			.insert(assetDocument)
			.values({
				assetId: params.id,
				filename: parsed.value.filename,
				storedPath: null,
				mimeType: null,
				sizeBytes: null,
				description: null,
				uploadedBy: locals.user?.email ?? DEFAULT_ACTOR,
				connectorId: parsed.value.connectorId,
				externalUrl: parsed.value.externalUrl
			})
			.returning();
		return json(row, { status: 201 });
	}

	if (!ct.startsWith('multipart/form-data')) {
		return json({ error: 'expected multipart/form-data or application/json' }, { status: 400 });
	}

	const form = await request.formData();
	const file = form.get('file');
	const description = form.get('description');

	if (!(file instanceof File)) return json({ error: 'file field is required' }, { status: 400 });

	const result = await saveUpload(params.id, file);
	if (!result.ok) return json({ error: result.error }, { status: result.status });

	const [row] = await db
		.insert(assetDocument)
		.values({
			assetId: params.id,
			filename: result.stored.filename,
			storedPath: result.stored.storedPath,
			mimeType: result.stored.mimeType,
			sizeBytes: result.stored.sizeBytes,
			description: typeof description === 'string' ? description || null : null,
			uploadedBy: locals.user?.email ?? DEFAULT_ACTOR
		})
		.returning();

	return json(row, { status: 201 });
};
