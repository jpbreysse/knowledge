import type { PageServerLoad } from './$types';
import { listFindings, type Severity, type Status, SEVERITIES, STATUSES } from '$lib/server/findings';

export const load: PageServerLoad = async ({ url }) => {
	const sevParam = url.searchParams.getAll('severity');
	const statusParam = url.searchParams.getAll('status');

	const severity = sevParam.length
		? sevParam.filter((s): s is Severity => (SEVERITIES as readonly string[]).includes(s))
		: undefined;
	const status = statusParam.length
		? statusParam.filter((s): s is Status => (STATUSES as readonly string[]).includes(s))
		: undefined;

	const search = url.searchParams.get('search') ?? undefined;
	const sortRaw = url.searchParams.get('sort') ?? 'raised_at';
	const sort = (['raised_at', 'severity', 'status', 'title'] as const).includes(sortRaw as never)
		? (sortRaw as 'raised_at' | 'severity' | 'status' | 'title')
		: 'raised_at';
	const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
	const limit = Number(url.searchParams.get('limit') ?? 50);
	const offset = Number(url.searchParams.get('offset') ?? 0);

	const { rows, total } = await listFindings({
		severity,
		status,
		search: search || undefined,
		sort,
		dir,
		limit: isFinite(limit) ? limit : 50,
		offset: isFinite(offset) ? offset : 0
	});

	return {
		findings: rows,
		total,
		filters: { severity: severity ?? [], status: status ?? [], search: search ?? '', sort, dir, limit, offset }
	};
};
