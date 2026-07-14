// Findings data layer — ported from the findings app (server/findings.ts)
// onto the merged schema: finding / finding_asset / finding_document live in
// asset_dev now (migration 015), so asset links are real FK JOINs and the
// panels on /assets/[id] are single-DB queries instead of a second pool.
//
// Raw postgres.js on purpose (matches the original; the asset app already
// dual-uses sqlClient for CTE-heavy reads). Description documents stay in
// the federated document store via callConnector.

import { sqlClient as db } from './db';
import type { Fragment, JSONValue } from 'postgres';
import { callConnector, ConnectorError } from './connector-client';
import { renderProseMirrorDocument } from './prosemirror-html';
import {
	SEVERITIES,
	STATUSES,
	FINDING_TYPES,
	type Severity,
	type Status,
	type FindingType,
	type Finding,
	type FindingRow,
	type AssetLink,
	type DocumentLink
} from '$lib/types';

export {
	SEVERITIES,
	STATUSES,
	FINDING_TYPES,
	type Severity,
	type Status,
	type FindingType,
	type Finding,
	type FindingRow,
	type AssetLink,
	type DocumentLink
};

export interface ListFilters {
	severity?: Severity[];
	status?: Status[];
	finding_type?: FindingType;
	search?: string;
	asset_id?: string;
	document_id?: string;
	sort?: 'raised_at' | 'severity' | 'status' | 'title';
	dir?: 'asc' | 'desc';
	limit?: number;
	offset?: number;
}

export async function listFindings(filters: ListFilters = {}): Promise<{
	rows: FindingRow[];
	total: number;
}> {
	const limit = Math.min(filters.limit ?? 50, 500);
	const offset = Math.max(filters.offset ?? 0, 0);
	const sort = filters.sort ?? 'raised_at';
	const dir = filters.dir === 'asc' ? 'ASC' : 'DESC';

	const conds: Fragment[] = [];
	if (filters.severity?.length) {
		conds.push(db`f.severity IN ${db(filters.severity)}`);
	}
	if (filters.status?.length) {
		conds.push(db`f.status IN ${db(filters.status)}`);
	}
	if (filters.finding_type) {
		conds.push(db`f.finding_type = ${filters.finding_type}`);
	}
	if (filters.search) {
		const q = `%${filters.search}%`;
		conds.push(db`(f.title ILIKE ${q} OR f.description_html ILIKE ${q})`);
	}
	if (filters.asset_id) {
		conds.push(
			db`EXISTS (SELECT 1 FROM finding_asset fa WHERE fa.finding_id = f.id AND fa.asset_id = ${filters.asset_id}::uuid)`
		);
	}
	if (filters.document_id) {
		conds.push(
			db`EXISTS (SELECT 1 FROM finding_document fd WHERE fd.finding_id = f.id AND fd.document_id = ${filters.document_id})`
		);
	}

	const where: Fragment = conds.length
		? conds.reduce<Fragment>((acc, c, i) => (i === 0 ? db`WHERE ${c}` : db`${acc} AND ${c}`), db``)
		: db``;

	let orderBy: Fragment;
	if (sort === 'severity') {
		orderBy = db`ORDER BY CASE f.severity
			WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1
		END ${db.unsafe(dir)}, f.raised_at DESC`;
	} else if (sort === 'status') {
		orderBy = db`ORDER BY f.status ${db.unsafe(dir)}, f.raised_at DESC`;
	} else if (sort === 'title') {
		orderBy = db`ORDER BY f.title ${db.unsafe(dir)}`;
	} else {
		orderBy = db`ORDER BY f.raised_at ${db.unsafe(dir)}`;
	}

	const rows = await db<FindingRow[]>`
		SELECT f.*,
			(SELECT COUNT(*)::int FROM finding_asset fa WHERE fa.finding_id = f.id) AS asset_count,
			(SELECT COUNT(*)::int FROM finding_document fd WHERE fd.finding_id = f.id) AS document_count
		FROM finding f
		${where}
		${orderBy}
		LIMIT ${limit} OFFSET ${offset}
	`;

	const totalRows = await db<{ count: number }[]>`
		SELECT COUNT(*)::int AS count FROM finding f ${where}
	`;

	return { rows, total: totalRows[0]?.count ?? 0 };
}

export async function getFinding(id: string): Promise<Finding | null> {
	const rows = await db<Finding[]>`
		SELECT * FROM finding WHERE id = ${id} LIMIT 1
	`;
	return rows[0] ?? null;
}

/** Asset links with display data JOINed from the register (no more
 *  denormalized tag/display copies — the FK guarantees the row exists). */
export async function getAssetLinks(findingId: string): Promise<AssetLink[]> {
	return db<AssetLink[]>`
		SELECT fa.finding_id, fa.asset_id::text AS asset_id,
			a.tag AS asset_tag,
			a.tag || ' — ' || a.name AS asset_display,
			fa.linked_at
		FROM finding_asset fa
		JOIN asset a ON a.id = fa.asset_id
		WHERE fa.finding_id = ${findingId}
		ORDER BY fa.linked_at DESC
	`;
}

export async function getDocumentLinks(findingId: string): Promise<DocumentLink[]> {
	return db<DocumentLink[]>`
		SELECT * FROM finding_document WHERE finding_id = ${findingId}
		ORDER BY linked_at DESC
	`;
}

export interface CreateInput {
	id: string;
	title: string;
	severity: Severity;
	status?: Status;
	finding_type?: FindingType;
	attributes?: Record<string, unknown>;
	raised_by?: string | null;
}

export async function createFinding(input: CreateInput): Promise<Finding> {
	// Provision a description document in the document-store. Best-effort:
	// if the document app is down, the finding is still created, just without
	// a doc id — the user can refresh / re-link later.
	const docId = crypto.randomUUID();
	let descriptionDocId: string | null = null;
	try {
		const res = await callConnector('document-store', '/docs', {
			method: 'POST',
			body: { id: docId, content: emptyProseMirrorDoc(), title: input.title }
		});
		if (res.ok) descriptionDocId = docId;
		else console.error('createFinding: document-store rejected create', res.status);
	} catch (e) {
		console.error('createFinding: document-store unreachable', (e as Error).message);
	}

	const rows = await db<Finding[]>`
		INSERT INTO finding (
			id, title, severity, status, finding_type,
			description_doc_id, description_html, attributes, raised_by
		) VALUES (
			${input.id},
			${input.title},
			${input.severity},
			${input.status ?? 'raised'},
			${input.finding_type ?? 'inspection'},
			${descriptionDocId},
			${''},
			${db.json((input.attributes ?? {}) as JSONValue)},
			${input.raised_by ?? null}
		)
		RETURNING *
	`;
	return rows[0];
}

export interface UpdateInput {
	title?: string;
	severity?: Severity;
	attributes?: Record<string, unknown>;
	updated_by?: string | null;
}

export async function updateFinding(id: string, input: UpdateInput): Promise<Finding | null> {
	const current = await getFinding(id);
	if (!current) return null;

	const title = input.title ?? current.title;
	const severity = input.severity ?? current.severity;
	const attributes = input.attributes ?? current.attributes;
	const updated_by = input.updated_by ?? null;

	const rows = await db<Finding[]>`
		UPDATE finding
		SET title = ${title},
			severity = ${severity},
			attributes = ${db.json(attributes as JSONValue)},
			updated_at = NOW(),
			updated_by = ${updated_by}
		WHERE id = ${id}
		RETURNING *
	`;
	return rows[0] ?? null;
}

export async function deleteFinding(id: string): Promise<boolean> {
	const finding = await getFinding(id);
	if (!finding) return false;

	// Best-effort cascade to the description document. Don't block delete if it
	// fails — orphan documents are a smaller problem than an undeletable finding.
	if (finding.description_doc_id) {
		try {
			await callConnector('document-store', `/docs/${finding.description_doc_id}`, {
				method: 'DELETE'
			});
		} catch (e) {
			console.error(
				`deleteFinding: failed to delete description doc ${finding.description_doc_id}`,
				(e as Error).message
			);
		}
	}

	const rows = await db`DELETE FROM finding WHERE id = ${id} RETURNING id`;
	return rows.length > 0;
}

/**
 * Re-fetch the description document from the document-store and update the
 * local description_html cache. Returns the fresh HTML (or null on failure).
 */
export async function refreshDescriptionCache(id: string): Promise<string | null> {
	const finding = await getFinding(id);
	if (!finding || !finding.description_doc_id) return null;
	try {
		const res = await callConnector('document-store', `/docs/${finding.description_doc_id}`);
		if (!res.ok) return null;
		const doc = (await res.json()) as { content: unknown };
		const html = renderProseMirrorDocument(doc.content);
		await db`
			UPDATE finding
			SET description_html = ${html},
				description_synced_at = NOW()
			WHERE id = ${id}
		`;
		return html;
	} catch (e) {
		if (e instanceof ConnectorError) {
			console.error('refreshDescriptionCache:', e.message);
		} else {
			console.error('refreshDescriptionCache:', (e as Error).message);
		}
		return null;
	}
}

function emptyProseMirrorDoc() {
	return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export async function transitionFinding(
	id: string,
	to: Status,
	by: string | null
): Promise<Finding | null> {
	const f = await getFinding(id);
	if (!f) return null;

	const setReviewed = to === 'reviewed' && !f.reviewed_at;
	const setClosed = to === 'closed' && !f.closed_at;

	const rows = await db<Finding[]>`
		UPDATE finding
		SET status = ${to},
			reviewed_at = CASE WHEN ${setReviewed} THEN NOW() ELSE reviewed_at END,
			reviewed_by = CASE WHEN ${setReviewed} THEN ${by} ELSE reviewed_by END,
			closed_at = CASE WHEN ${setClosed} THEN NOW() ELSE closed_at END,
			closed_by = CASE WHEN ${setClosed} THEN ${by} ELSE closed_by END,
			updated_at = NOW(),
			updated_by = ${by}
		WHERE id = ${id}
		RETURNING *
	`;
	return rows[0] ?? null;
}

/**
 * Link a finding to an asset. Returns null when the asset doesn't exist —
 * the FK now enforces what the old cross-DB bridge merely hoped for.
 */
export async function linkAsset(findingId: string, assetId: string): Promise<AssetLink | null> {
	try {
		await db`
			INSERT INTO finding_asset (finding_id, asset_id)
			VALUES (${findingId}, ${assetId}::uuid)
			ON CONFLICT (finding_id, asset_id) DO NOTHING
		`;
	} catch (e) {
		const msg = (e as Error).message ?? '';
		// FK violation (asset gone) or bad uuid literal → not linkable
		if (msg.includes('finding_asset_asset_id_fkey') || msg.includes('invalid input syntax'))
			return null;
		throw e;
	}
	const rows = await db<AssetLink[]>`
		SELECT fa.finding_id, fa.asset_id::text AS asset_id,
			a.tag AS asset_tag, a.tag || ' — ' || a.name AS asset_display, fa.linked_at
		FROM finding_asset fa JOIN asset a ON a.id = fa.asset_id
		WHERE fa.finding_id = ${findingId} AND fa.asset_id = ${assetId}::uuid
	`;
	return rows[0] ?? null;
}

export async function unlinkAsset(findingId: string, assetId: string): Promise<boolean> {
	const rows = await db`
		DELETE FROM finding_asset
		WHERE finding_id = ${findingId} AND asset_id = ${assetId}::uuid
		RETURNING finding_id
	`;
	return rows.length > 0;
}

export async function linkDocument(
	findingId: string,
	documentId: string,
	documentTitle: string | null
): Promise<DocumentLink> {
	const rows = await db<DocumentLink[]>`
		INSERT INTO finding_document (finding_id, document_id, document_title)
		VALUES (${findingId}, ${documentId}, ${documentTitle})
		ON CONFLICT (finding_id, document_id) DO UPDATE
			SET document_title = EXCLUDED.document_title
		RETURNING *
	`;
	return rows[0];
}

export async function unlinkDocument(findingId: string, documentId: string): Promise<boolean> {
	const rows = await db`
		DELETE FROM finding_document
		WHERE finding_id = ${findingId} AND document_id = ${documentId}
		RETURNING finding_id
	`;
	return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Asset-page panels — these replace src/lib/server/knowledge.ts (the second
// pool). Same output shapes as before, single-DB queries now.
// ---------------------------------------------------------------------------

export type FindingForAsset = {
	id: string;
	title: string;
	severity: Severity;
	status: Status;
	finding_type: string;
	raised_at: Date;
};

export async function findingsForAsset(assetId: string, limit = 10): Promise<FindingForAsset[]> {
	return db<FindingForAsset[]>`
		SELECT f.id, f.title, f.severity, f.status, f.finding_type, f.raised_at
		FROM finding f
		JOIN finding_asset fa ON fa.finding_id = f.id
		WHERE fa.asset_id = ${assetId}::uuid
		ORDER BY
			CASE f.severity
				WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3
				ELSE 9
			END,
			f.raised_at DESC
		LIMIT ${limit}
	`;
}

export type PrecedentFinding = {
	id: string;
	title: string;
	severity: Severity;
	closed_at: Date;
	precedent_asset_tag: string;
	precedent_site_name: string;
	precedent_site_tag: string;
};

/**
 * Cross-site precedents: closed findings on same-class assets under a
 * DIFFERENT site. Was two queries across two databases; now one query —
 * the site walk CTE joins straight onto finding_asset.
 */
export async function precedentsForAsset(
	classCode: string | null,
	currentSiteAssetId: string | null,
	limit = 5
): Promise<PrecedentFinding[]> {
	if (!classCode || !currentSiteAssetId) return [];
	return db<PrecedentFinding[]>`
		WITH RECURSIVE chain AS (
			SELECT id, tag, name, class_code, parent_id, id AS leaf_id, tag AS leaf_tag
			FROM asset
			WHERE class_code = ${classCode}
			UNION ALL
			SELECT a.id, a.tag, a.name, a.class_code, a.parent_id, chain.leaf_id, chain.leaf_tag
			FROM asset a JOIN chain ON a.id = chain.parent_id
			WHERE chain.class_code <> 'SITE'
		),
		candidates AS (
			SELECT leaf_id, leaf_tag, tag AS site_tag, name AS site_name
			FROM chain
			WHERE class_code = 'SITE' AND id <> ${currentSiteAssetId}
		)
		SELECT f.id, f.title, f.severity, f.closed_at,
			c.leaf_tag AS precedent_asset_tag,
			c.site_name AS precedent_site_name,
			c.site_tag AS precedent_site_tag
		FROM candidates c
		JOIN finding_asset fa ON fa.asset_id = c.leaf_id
		JOIN finding f ON f.id = fa.finding_id AND f.status = 'closed'
		ORDER BY
			CASE f.severity
				WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3
				ELSE 9
			END,
			f.closed_at DESC
		LIMIT ${limit}
	`;
}
