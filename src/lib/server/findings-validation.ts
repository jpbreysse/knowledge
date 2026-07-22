// Hand-rolled validators for the findings API — replaces the findings app's
// zod schemas (the asset app deliberately has no validation framework; see
// validation.ts for the same style on assets). Error shape mirrors the old
// zod responses closely enough for the ported UI: { error, issues: [{path,
// message}] }.

import { SEVERITIES, STATUSES, FINDING_TYPES, type Severity, type Status, type FindingType } from '$lib/types';

export type Issue = { path: string; message: string };
export type Parsed<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isObject(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

function optStr(v: unknown, path: string, issues: Issue[], max = 500): string | null | undefined {
	if (v === undefined) return undefined;
	if (v === null) return null;
	if (typeof v !== 'string') {
		issues.push({ path, message: 'must be a string' });
		return undefined;
	}
	if (v.length > max) issues.push({ path, message: `max ${max} chars` });
	return v;
}

export function validateCreateFinding(
	body: unknown,
	extraAllowedTypes: string[] = []
): Parsed<{
	id: string;
	title: string;
	severity: Severity;
	status?: Status;
	finding_type?: FindingType;
	attributes?: Record<string, unknown>;
	raised_by?: string | null;
}> {
	const issues: Issue[] = [];
	if (!isObject(body)) return { ok: false, issues: [{ path: '', message: 'body must be an object' }] };

	const id = typeof body.id === 'string' ? body.id : '';
	if (!UUID_RE.test(id)) issues.push({ path: 'id', message: 'must be a UUID' });

	const title = typeof body.title === 'string' ? body.title.trim() : '';
	if (!title) issues.push({ path: 'title', message: 'required' });
	else if (title.length > 500) issues.push({ path: 'title', message: 'max 500 chars' });

	const severity = body.severity as Severity;
	if (!SEVERITIES.includes(severity))
		issues.push({ path: 'severity', message: `must be one of ${SEVERITIES.join(', ')}` });

	let status: Status | undefined;
	if (body.status !== undefined) {
		if (!STATUSES.includes(body.status as Status))
			issues.push({ path: 'status', message: `must be one of ${STATUSES.join(', ')}` });
		else status = body.status as Status;
	}

	let findingType: FindingType | undefined;
	if (body.finding_type !== undefined) {
		const allowed = [...FINDING_TYPES, ...extraAllowedTypes];
		if (!allowed.includes(body.finding_type as FindingType))
			issues.push({ path: 'finding_type', message: `must be one of ${allowed.join(', ')}` });
		else findingType = body.finding_type as FindingType;
	}

	let attributes: Record<string, unknown> | undefined;
	if (body.attributes !== undefined) {
		if (!isObject(body.attributes)) issues.push({ path: 'attributes', message: 'must be an object' });
		else attributes = body.attributes;
	}

	const raised_by = optStr(body.raised_by, 'raised_by', issues);

	if (issues.length) return { ok: false, issues };
	return {
		ok: true,
		value: { id, title, severity, status, finding_type: findingType, attributes, raised_by }
	};
}

export function validateUpdateFinding(body: unknown): Parsed<{
	title?: string;
	severity?: Severity;
	attributes?: Record<string, unknown>;
	updated_by?: string | null;
}> {
	const issues: Issue[] = [];
	if (!isObject(body)) return { ok: false, issues: [{ path: '', message: 'body must be an object' }] };

	let title: string | undefined;
	if (body.title !== undefined) {
		if (typeof body.title !== 'string' || !body.title.trim())
			issues.push({ path: 'title', message: 'required' });
		else if (body.title.length > 500) issues.push({ path: 'title', message: 'max 500 chars' });
		else title = body.title;
	}

	let severity: Severity | undefined;
	if (body.severity !== undefined) {
		if (!SEVERITIES.includes(body.severity as Severity))
			issues.push({ path: 'severity', message: `must be one of ${SEVERITIES.join(', ')}` });
		else severity = body.severity as Severity;
	}

	let attributes: Record<string, unknown> | undefined;
	if (body.attributes !== undefined) {
		if (!isObject(body.attributes)) issues.push({ path: 'attributes', message: 'must be an object' });
		else attributes = body.attributes;
	}

	const updated_by = optStr(body.updated_by, 'updated_by', issues);

	if (issues.length) return { ok: false, issues };
	return { ok: true, value: { title, severity, attributes, updated_by } };
}

export function validateTransition(body: unknown): Parsed<{ to_status: Status; by_user?: string | null }> {
	const issues: Issue[] = [];
	if (!isObject(body)) return { ok: false, issues: [{ path: '', message: 'body must be an object' }] };

	const to = body.to_status as Status;
	if (!STATUSES.includes(to))
		issues.push({ path: 'to_status', message: `must be one of ${STATUSES.join(', ')}` });

	const by_user = optStr(body.by_user, 'by_user', issues);

	if (issues.length) return { ok: false, issues };
	return { ok: true, value: { to_status: to, by_user } };
}

export function validateLinkAsset(body: unknown): Parsed<{ asset_id: string }> {
	if (!isObject(body)) return { ok: false, issues: [{ path: '', message: 'body must be an object' }] };
	const assetId = typeof body.asset_id === 'string' ? body.asset_id : '';
	if (!UUID_RE.test(assetId))
		return { ok: false, issues: [{ path: 'asset_id', message: 'must be a UUID' }] };
	return { ok: true, value: { asset_id: assetId } };
}

export function validateLinkDocument(body: unknown): Parsed<{ document_id: string; document_title?: string | null }> {
	const issues: Issue[] = [];
	if (!isObject(body)) return { ok: false, issues: [{ path: '', message: 'body must be an object' }] };
	const documentId = typeof body.document_id === 'string' ? body.document_id.trim() : '';
	if (!documentId) issues.push({ path: 'document_id', message: 'required' });
	const document_title = optStr(body.document_title, 'document_title', issues);
	if (issues.length) return { ok: false, issues };
	return { ok: true, value: { document_id: documentId, document_title } };
}
