import type { RequestHandler } from './$types';
import { sqlClient as db } from '$lib/server/db';

function csvCell(v: unknown): string {
	if (v === null || v === undefined) return '';
	const s = String(v);
	if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
	return s;
}

export const GET: RequestHandler = async () => {
	const rows = await db<
		{
			id: string;
			title: string;
			finding_type: string;
			severity: string;
			status: string;
			raised_at: Date;
			raised_by: string | null;
			closed_at: Date | null;
			closed_by: string | null;
			asset_count: number;
			document_count: number;
			asset_tags: string | null;
			document_titles: string | null;
		}[]
	>`
		SELECT f.id, f.title, f.finding_type, f.severity, f.status,
			f.raised_at, f.raised_by, f.closed_at, f.closed_by,
			(SELECT COUNT(*)::int FROM finding_asset fa WHERE fa.finding_id = f.id) AS asset_count,
			(SELECT COUNT(*)::int FROM finding_document fd WHERE fd.finding_id = f.id) AS document_count,
			(SELECT STRING_AGG(a.tag, '; ')
				FROM finding_asset fa JOIN asset a ON a.id = fa.asset_id
				WHERE fa.finding_id = f.id) AS asset_tags,
			(SELECT STRING_AGG(COALESCE(fd.document_title, fd.document_id), '; ')
				FROM finding_document fd WHERE fd.finding_id = f.id) AS document_titles
		FROM finding f
		ORDER BY f.raised_at DESC
	`;

	const header = [
		'id',
		'title',
		'finding_type',
		'severity',
		'status',
		'raised_at',
		'raised_by',
		'closed_at',
		'closed_by',
		'asset_count',
		'document_count',
		'asset_tags',
		'document_titles'
	];
	const lines = [header.join(',')];
	for (const r of rows) {
		lines.push(
			[
				r.id,
				r.title,
				r.finding_type,
				r.severity,
				r.status,
				r.raised_at ? new Date(r.raised_at).toISOString() : '',
				r.raised_by ?? '',
				r.closed_at ? new Date(r.closed_at).toISOString() : '',
				r.closed_by ?? '',
				r.asset_count,
				r.document_count,
				r.asset_tags ?? '',
				r.document_titles ?? ''
			]
				.map(csvCell)
				.join(',')
		);
	}

	return new Response(lines.join('\n'), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="findings.csv"'
		}
	});
};
