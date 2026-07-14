import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import {
	listFindings,
	createFinding,
	type Severity,
	type Status,
	type FindingType,
	SEVERITIES,
	STATUSES,
	FINDING_TYPES
} from '$lib/server/findings';
import { validateCreateFinding } from '$lib/server/findings-validation';

export const GET: RequestHandler = async ({ url }) => {
	const sevParam = url.searchParams.getAll('severity');
	const statusParam = url.searchParams.getAll('status');
	const typeParam = url.searchParams.get('finding_type') ?? undefined;

	const severity = sevParam.length
		? sevParam.filter((s): s is Severity => (SEVERITIES as readonly string[]).includes(s))
		: undefined;
	const status = statusParam.length
		? statusParam.filter((s): s is Status => (STATUSES as readonly string[]).includes(s))
		: undefined;
	const finding_type =
		typeParam && (FINDING_TYPES as readonly string[]).includes(typeParam)
			? (typeParam as FindingType)
			: undefined;

	const search = url.searchParams.get('search') ?? undefined;
	const asset_id = url.searchParams.get('asset_id') ?? undefined;
	const document_id = url.searchParams.get('document_id') ?? undefined;
	const sortRaw = url.searchParams.get('sort') ?? 'raised_at';
	const sort = (['raised_at', 'severity', 'status', 'title'] as const).includes(sortRaw as never)
		? (sortRaw as 'raised_at' | 'severity' | 'status' | 'title')
		: 'raised_at';
	const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
	const limit = Number(url.searchParams.get('limit') ?? 50);
	const offset = Number(url.searchParams.get('offset') ?? 0);

	const result = await listFindings({
		severity,
		status,
		finding_type,
		search: search || undefined,
		asset_id: asset_id || undefined,
		document_id: document_id || undefined,
		sort,
		dir,
		limit: isFinite(limit) ? limit : 50,
		offset: isFinite(offset) ? offset : 0
	});
	return json(result);
};

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	const parsed = validateCreateFinding(body);
	if (!parsed.ok) {
		return json({ error: 'Validation failed', issues: parsed.issues }, { status: 400 });
	}
	const finding = await createFinding(parsed.value);
	return json(finding, { status: 201 });
};
