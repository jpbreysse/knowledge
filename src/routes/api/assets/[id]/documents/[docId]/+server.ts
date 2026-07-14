import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assetDocument } from '$lib/server/db/schema';
import { deleteStoredFile, openStoredFile } from '$lib/server/uploads';
import { isUuid } from '$lib/server/validation';

export const GET: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id) || !isUuid(params.docId)) throw error(400, 'invalid id');
	const [doc] = await db
		.select()
		.from(assetDocument)
		.where(and(eq(assetDocument.id, params.docId), eq(assetDocument.assetId, params.id)))
		.limit(1);
	if (!doc) throw error(404, 'not found');
	// Linked-from-connector docs have no local file — clients should follow external_url instead.
	if (!doc.storedPath) throw error(404, 'this document is a connector link, not a local file');

	let opened;
	try {
		opened = await openStoredFile(doc.storedPath);
	} catch {
		throw error(404, 'file missing on disk');
	}

	const webStream = new ReadableStream({
		start(controller) {
			const node = opened.stream();
			node.on('data', (chunk) =>
				controller.enqueue(chunk instanceof Buffer ? new Uint8Array(chunk) : chunk)
			);
			node.on('end', () => controller.close());
			node.on('error', (e) => controller.error(e));
		}
	});

	return new Response(webStream, {
		headers: {
			'content-type': doc.mimeType ?? 'application/octet-stream',
			'content-length': String(opened.size),
			'content-disposition': `attachment; filename="${doc.filename.replace(/"/g, '')}"`
		}
	});
};

/**
 * Remove a document from an asset.
 *  - Uploaded files: also unlink the local file under UPLOAD_DIR.
 *  - Linked docs: delete the row only — the file lives on the connector.
 * Idempotent on the file side: missing-on-disk is not an error.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id) || !isUuid(params.docId)) throw error(400, 'invalid id');
	const [doc] = await db
		.select()
		.from(assetDocument)
		.where(and(eq(assetDocument.id, params.docId), eq(assetDocument.assetId, params.id)))
		.limit(1);
	if (!doc) throw error(404, 'not found');

	if (doc.storedPath) {
		try {
			await deleteStoredFile(doc.storedPath);
		} catch (e) {
			// Log and continue — the row should still be removed even if disk cleanup fails.
			console.error('failed to delete stored file', doc.storedPath, e);
		}
	}

	await db.delete(assetDocument).where(eq(assetDocument.id, params.docId));
	return new Response(null, { status: 204 });
};
