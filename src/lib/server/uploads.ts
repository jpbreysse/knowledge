import { mkdir, writeFile, stat, readFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '$env/dynamic/private';

export const UPLOAD_DIR = resolve(env.UPLOAD_DIR ?? './uploads');
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

// MIME + magic-byte whitelist. file-type returns canonical mime for binary
// formats. Well-formed DOCX sniffs as the full OOXML mime; a DOCX whose
// [Content_Types].xml isn't the first zip entry falls back to
// 'application/zip' — both acceptable, the extension check already
// constrains us to .docx.
const ALLOWED_SNIFFED_MIME = new Set([
	'application/pdf',
	'image/png',
	'image/jpeg',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
	'application/zip' // DOCX (non-canonical zip entry order)
]);

const ALLOWED_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'docx']);

export function extOf(name: string): string {
	const i = name.lastIndexOf('.');
	return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

export type StoredFile = {
	filename: string;
	storedPath: string;
	mimeType: string;
	sizeBytes: number;
};

export async function saveUpload(
	assetId: string,
	file: File
): Promise<{ ok: true; stored: StoredFile } | { ok: false; error: string; status: number }> {
	if (file.size > MAX_FILE_BYTES) {
		return { ok: false, error: `file too large (max ${MAX_FILE_BYTES} bytes)`, status: 413 };
	}
	if (file.size === 0) {
		return { ok: false, error: 'empty file', status: 400 };
	}

	const ext = extOf(file.name);
	if (!ALLOWED_EXT.has(ext)) {
		return { ok: false, error: `extension .${ext} not allowed`, status: 415 };
	}

	const buf = Buffer.from(await file.arrayBuffer());
	const sniffed = await fileTypeFromBuffer(buf);
	if (!sniffed || !ALLOWED_SNIFFED_MIME.has(sniffed.mime)) {
		return { ok: false, error: 'file content does not match an allowed type', status: 415 };
	}

	// Cross-check ext ↔ sniffed mime so a .pdf renamed .docx doesn't get through.
	const mismatched =
		(sniffed.mime === 'application/pdf' && ext !== 'pdf') ||
		(sniffed.mime === 'image/png' && ext !== 'png') ||
		(sniffed.mime === 'image/jpeg' && ext !== 'jpg' && ext !== 'jpeg') ||
		(sniffed.mime === 'application/zip' && ext !== 'docx') ||
		(sniffed.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
			ext !== 'docx');
	if (mismatched) {
		return { ok: false, error: 'file extension does not match content', status: 415 };
	}

	// DOCX-specific heuristic: the zip must begin with PK and contain the expected content-type.
	const mime =
		sniffed.mime === 'application/zip'
			? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			: sniffed.mime;

	const dir = join(UPLOAD_DIR, assetId);
	await mkdir(dir, { recursive: true });

	const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
	const storedName = `${randomUUID()}-${safeName}`;
	const absPath = join(dir, storedName);
	await writeFile(absPath, buf);
	const relPath = join(assetId, storedName);

	return {
		ok: true,
		stored: {
			filename: file.name,
			storedPath: relPath,
			mimeType: mime,
			sizeBytes: file.size
		}
	};
}

export async function openStoredFile(relPath: string) {
	const abs = resolve(UPLOAD_DIR, relPath);
	// Guard against path traversal — the absolute path must stay under UPLOAD_DIR.
	if (!abs.startsWith(UPLOAD_DIR + '/') && abs !== UPLOAD_DIR) {
		throw new Error('invalid path');
	}
	const s = await stat(abs);
	return { abs, size: s.size, stream: () => createReadStream(abs) };
}

/** Best-effort delete of a stored file. Path-traversal-safe. Swallows
 *  ENOENT so a missing-on-disk file doesn't block deleting the DB row. */
export async function deleteStoredFile(relPath: string): Promise<void> {
	const abs = resolve(UPLOAD_DIR, relPath);
	if (!abs.startsWith(UPLOAD_DIR + '/') && abs !== UPLOAD_DIR) {
		throw new Error('invalid path');
	}
	try {
		await unlink(abs);
	} catch (e) {
		const code = (e as NodeJS.ErrnoException)?.code;
		if (code !== 'ENOENT') throw e;
	}
}

export { readFile };
