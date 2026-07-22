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
import { getTypeDef } from '$lib/server/finding-vocab';

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

export const POST: RequestHandler = async ({ request, locals }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	// Domain vocabulary: an offerable direct type widens the allowed set and
	// brings required_fields (enforced below with field-level issues). With no
	// vocabulary loaded this resolves to null → legacy behavior, bit for bit.
	const requestedType =
		body && typeof (body as { finding_type?: unknown }).finding_type === 'string'
			? (body as { finding_type: string }).finding_type
			: null;
	const typeDef = requestedType ? await getTypeDef(requestedType) : null;
	const offerable =
		!!typeDef && typeDef.kind === 'direct' && !typeDef.deprecated && !typeDef.missing_from_bundle;

	const parsed = validateCreateFinding(body, offerable ? [typeDef!.type] : []);
	if (!parsed.ok) {
		return json({ error: 'Validation failed', issues: parsed.issues }, { status: 400 });
	}

	if (offerable) {
		const issues: { path: string; message: string }[] = [];
		for (const rf of typeDef!.required_fields) {
			if (rf === 'title') continue; // native column, already required
			const v = parsed.value.attributes?.[rf];
			if (v === undefined || v === null || v === '') {
				issues.push({ path: `attributes.${rf}`, message: 'required' });
			}
		}
		if (issues.length) return json({ error: 'Validation failed', issues }, { status: 400 });
	}

	const finding = await createFinding({
		...parsed.value,
		raised_by: parsed.value.raised_by ?? locals.user?.email ?? null
	});
	return json(finding, { status: 201 });
};
