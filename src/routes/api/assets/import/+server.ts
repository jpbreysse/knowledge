import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAssetClassByCode } from '$lib/server/asset-classes';
import { commitImport, validateImport } from '$lib/server/import';

/**
 * Bulk CSV import, one class per file.
 *
 * Body: { class_code, csv, commit?: boolean, mode?: 'soft' | 'hard' }
 *  - commit=false (default): dry run — returns the full validation report.
 *  - commit=true, mode='soft': insert valid rows, skip invalid ones.
 *  - commit=true, mode='hard': refuse to insert anything if any row is invalid.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as {
		class_code?: unknown;
		csv?: unknown;
		commit?: unknown;
		mode?: unknown;
	} | null;
	if (!body || typeof body !== 'object')
		return json({ errors: { _root: 'body must be an object' } }, { status: 400 });

	const classCode = typeof body.class_code === 'string' ? body.class_code.trim() : '';
	if (!classCode) return json({ errors: { class_code: 'required' } }, { status: 400 });
	const classDef = await getAssetClassByCode(classCode);
	if (!classDef) return json({ errors: { class_code: 'unknown class' } }, { status: 400 });

	const csv = typeof body.csv === 'string' ? body.csv : '';
	if (!csv) return json({ errors: { csv: 'required' } }, { status: 400 });
	if (csv.length > 5_000_000) return json({ errors: { csv: 'file too large (max 5 MB)' } }, { status: 400 });

	const mode = body.mode === 'hard' ? 'hard' : 'soft';
	const validation = await validateImport(classDef, csv);

	if (body.commit !== true) return json({ dry_run: true, mode, ...validation });

	if (validation.fileErrors.length > 0 || validation.summary.valid === 0)
		return json({ dry_run: false, mode, ...validation }, { status: 400 });
	if (mode === 'hard' && !validation.ok)
		return json(
			{ dry_run: false, mode, ...validation, refused: 'hard mode: file has invalid rows' },
			{ status: 400 }
		);

	const result = await commitImport(classDef, validation);
	return json({ dry_run: false, mode, ...validation, ...result }, { status: 201 });
};
