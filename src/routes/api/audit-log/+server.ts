import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { sqlClient as db } from '$lib/server/db';
import type { Fragment } from 'postgres';

export const GET: RequestHandler = async ({ url }) => {
	const method = url.searchParams.get('method') ?? undefined;
	const path = url.searchParams.get('path') ?? undefined;
	const status = url.searchParams.get('status') ?? undefined;
	const from = url.searchParams.get('from') ?? undefined;
	const to = url.searchParams.get('to') ?? undefined;
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

	const rows = await db`
		SELECT id, ts, method, path, status, duration_ms, ip, user_agent, body_size
		FROM audit_log
		${where}
		ORDER BY ts DESC
		LIMIT ${limit} OFFSET ${offset}
	`;
	const totalRows = await db<{ count: number }[]>`
		SELECT COUNT(*)::int AS count FROM audit_log ${where}
	`;
	return json({ rows, total: totalRows[0]?.count ?? 0 });
};
