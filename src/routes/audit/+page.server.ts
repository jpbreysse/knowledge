import type { PageServerLoad } from './$types';
import { sqlClient as db } from '$lib/server/db';
import type { Fragment } from 'postgres';

export const load: PageServerLoad = async ({ url }) => {
	const method = url.searchParams.get('method') ?? '';
	const path = url.searchParams.get('path') ?? '';
	const status = url.searchParams.get('status') ?? '';
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 1000);
	const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);

	const conds: Fragment[] = [];
	if (method) conds.push(db`method = ${method}`);
	if (path) conds.push(db`path ILIKE ${`%${path}%`}`);
	if (status) conds.push(db`status = ${Number(status)}`);
	if (from) conds.push(db`ts >= ${from}`);
	if (to) conds.push(db`ts <= ${to}`);

	const where: Fragment = conds.length
		? conds.reduce<Fragment>((acc, c, i) => (i === 0 ? db`WHERE ${c}` : db`${acc} AND ${c}`), db``)
		: db``;

	const rows = await db<
		{
			id: string;
			ts: Date;
			method: string;
			path: string;
			status: number | null;
			duration_ms: number | null;
			ip: string | null;
		}[]
	>`
		SELECT id, ts, method, path, status, duration_ms, ip
		FROM audit_log ${where}
		ORDER BY ts DESC
		LIMIT ${limit} OFFSET ${offset}
	`;

	const totalRows = await db<{ count: number }[]>`
		SELECT COUNT(*)::int AS count FROM audit_log ${where}
	`;

	return {
		rows,
		total: totalRows[0]?.count ?? 0,
		filters: { method, path, status, from, to, limit, offset }
	};
};
