import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { asset } from '$lib/server/db/schema';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { getAssetClassByCode } from '$lib/server/asset-classes';
import { parseAttrQuery } from '$lib/server/attr-query';

// v3.1: the 7 equipment fields moved into `attributes` JSONB. The CSV export
// now surfaces them as `attributes.manufacturer`/etc. via the attribute-key
// flattening loop below, so nothing is lost — they're just no longer
// top-level columns.
const BASE_COLS = [
	'id',
	'tag',
	'name',
	'class_code',
	'parent_id',
	'confidentiality',
	'version',
	'supersedes_asset_id',
	'created_at',
	'updated_at',
	'updated_by'
] as const;

function csvCell(v: unknown): string {
	if (v === null || v === undefined) return '';
	const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
	if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
	return s;
}

export const GET: RequestHandler = async ({ url }) => {
	// The export honors the list page's active query (search, class, attr.*)
	// so "Export CSV" exports what the user is looking at — filters absent,
	// it still exports the whole register.
	const p = url.searchParams;
	const classCode = p.get('class_code');
	const classDef = classCode ? await getAssetClassByCode(classCode) : null;
	const attrQuery = parseAttrQuery(p, classDef);

	const conds = [];
	if (classCode) conds.push(eq(asset.classCode, classCode));
	if (p.get('search')?.trim()) {
		for (const t of p.get('search')!.trim().split(/\s+/).filter(Boolean)) {
			const q = `%${t}%`;
			conds.push(
				or(ilike(asset.tag, q), ilike(asset.name, q), sql`${asset.attributes}::text ILIKE ${q}`)
			);
		}
	}
	conds.push(...attrQuery.conds);

	const rows = await db
		.select()
		.from(asset)
		.where(conds.length ? and(...conds) : undefined)
		.orderBy(asc(asset.tag));

	// Union of attribute keys across all rows (stable order).
	const attrKeySet = new Set<string>();
	for (const r of rows) {
		const a = (r.attributes ?? {}) as Record<string, unknown>;
		for (const k of Object.keys(a)) attrKeySet.add(k);
	}
	const attrKeys = [...attrKeySet].sort();

	const header = [...BASE_COLS, ...attrKeys.map((k) => `attributes.${k}`)];
	const lines = [header.map(csvCell).join(',')];

	for (const r of rows) {
		const attrs = (r.attributes ?? {}) as Record<string, unknown>;
		const base: Record<(typeof BASE_COLS)[number], unknown> = {
			id: r.id,
			tag: r.tag,
			name: r.name,
			class_code: r.classCode,
			parent_id: r.parentId,
			confidentiality: r.confidentiality,
			version: r.version,
			supersedes_asset_id: r.supersedesAssetId,
			created_at: r.createdAt?.toISOString?.() ?? r.createdAt,
			updated_at: r.updatedAt?.toISOString?.() ?? r.updatedAt,
			updated_by: r.updatedBy
		};
		const cells: unknown[] = BASE_COLS.map((c) => base[c]);
		for (const k of attrKeys) cells.push(attrs[k] ?? '');
		lines.push(cells.map(csvCell).join(','));
	}

	return new Response(lines.join('\n') + '\n', {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="assets-${new Date().toISOString().slice(0, 10)}.csv"`
		}
	});
};
