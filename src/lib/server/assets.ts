import { and, desc, eq, ilike, or, sql, asc, isNull } from 'drizzle-orm';
import { db, sqlClient } from './db';
import {
	asset,
	assetAssessment,
	assetDocument,
	assetHistory,
	connector,
	entityLink
} from './db/schema';

export type ListParams = {
	search?: string | null;
	classCode?: string | null;
	conditionRating?: string | null; // 'A' | 'B' | 'C' | 'D' | 'unassessed'
	sort?: 'tag' | 'name' | 'class_code';
	dir?: 'asc' | 'desc';
	limit?: number;
};

// v3.1: sort columns limited to what still lives on the asset row.
// Attribute-based sorts (criticality, lifecycle, location) go through a
// separate route if needed later (JSONB indexed sort).
const SORT_COLS = {
	tag: asset.tag,
	name: asset.name,
	class_code: asset.classCode
} as const;

/**
 * Single-query SELECT that also attaches the most-recent assessment's
 * condition_rating and status to each asset row.
 * The ROW_NUMBER() subquery collapses to one row per asset (latest by
 * assessed_on, then created_at as tiebreaker).
 */
function latestAssessmentSubquery() {
	return db
		.select({
			assetId: assetAssessment.assetId,
			conditionRating: assetAssessment.conditionRating,
			status: assetAssessment.status,
			rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${assetAssessment.assetId} ORDER BY ${assetAssessment.assessedOn} DESC NULLS LAST, ${assetAssessment.createdAt} DESC)`.as(
				'rn'
			)
		})
		.from(assetAssessment)
		.as('latest');
}

export async function listAssets(params: ListParams) {
	const latest = latestAssessmentSubquery();

	const conds: ReturnType<typeof eq>[] = [];
	if (params.search && params.search.trim()) {
		// v3.1: search hits the whole attributes JSONB as text — matches any
		// value (jurisdiction, location, sponsor_name, model, etc.) not just
		// the small set of legacy columns — plus attached document filenames,
		// so searching a doc name surfaces the asset carrying it. Terms are
		// AND-ed so word order doesn't matter ("pump drain" == "drain pump").
		// Cheap enough under the 500-row cap; promote to GIN if it grows.
		for (const t of params.search.trim().split(/\s+/).filter(Boolean)) {
			const q = `%${t}%`;
			conds.push(
				// @ts-expect-error -- drizzle unions
				or(
					ilike(asset.tag, q),
					ilike(asset.name, q),
					sql`${asset.attributes}::text ILIKE ${q}`,
					sql`EXISTS (SELECT 1 FROM ${assetDocument}
						WHERE ${assetDocument.assetId} = ${asset.id}
						  AND ${assetDocument.filename} ILIKE ${q})`
				)
			);
		}
	}
	if (params.classCode) conds.push(eq(asset.classCode, params.classCode));
	if (params.conditionRating) {
		if (params.conditionRating === 'unassessed') {
			conds.push(isNull(latest.conditionRating));
		} else {
			conds.push(eq(latest.conditionRating, params.conditionRating));
		}
	}

	const sortCol = SORT_COLS[params.sort ?? 'tag'];
	const orderFn = params.dir === 'desc' ? desc : asc;
	const limit = Math.min(params.limit ?? 500, 1000);

	return db
		.select({
			id: asset.id,
			tag: asset.tag,
			name: asset.name,
			classCode: asset.classCode,
			attributes: asset.attributes,
			parentId: asset.parentId,
			confidentiality: asset.confidentiality,
			version: asset.version,
			createdAt: asset.createdAt,
			updatedAt: asset.updatedAt,
			updatedBy: asset.updatedBy,
			latestCondition: latest.conditionRating,
			latestAssessmentStatus: latest.status,
			// v3.1: entity_link count (outgoing + incoming) per asset — surfaces
			// cross-cutting relationships on the list page. Correlated subquery
			// is cheap at the current row cap (≤500).
			linkCount: sql<number>`(
				SELECT COUNT(*)::int FROM ${entityLink}
				WHERE ${entityLink.sourceId} = ${asset.id}
				   OR ${entityLink.targetId} = ${asset.id}
			)`.as('link_count')
		})
		.from(asset)
		.leftJoin(latest, and(eq(latest.assetId, asset.id), eq(latest.rn, 1)))
		.where(conds.length ? and(...conds) : undefined)
		.orderBy(orderFn(sortCol))
		.limit(limit);
}

export async function getAsset(id: string) {
	const rows = await db.select().from(asset).where(eq(asset.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function hasChildren(id: string): Promise<boolean> {
	const rows = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(asset)
		.where(eq(asset.parentId, id));
	return (rows[0]?.c ?? 0) > 0;
}

export async function listDocumentsFor(assetId: string) {
	return db
		.select({
			id: assetDocument.id,
			assetId: assetDocument.assetId,
			filename: assetDocument.filename,
			storedPath: assetDocument.storedPath,
			mimeType: assetDocument.mimeType,
			sizeBytes: assetDocument.sizeBytes,
			description: assetDocument.description,
			uploadedAt: assetDocument.uploadedAt,
			uploadedBy: assetDocument.uploadedBy,
			connectorId: assetDocument.connectorId,
			externalUrl: assetDocument.externalUrl,
			connectorName: connector.name,
			connectorLabel: connector.label
		})
		.from(assetDocument)
		.leftJoin(connector, eq(connector.id, assetDocument.connectorId))
		.where(eq(assetDocument.assetId, assetId))
		.orderBy(desc(assetDocument.uploadedAt));
}

export async function listHistoryFor(assetId: string, limit = 50) {
	return db
		.select()
		.from(assetHistory)
		.where(eq(assetHistory.assetId, assetId))
		.orderBy(desc(assetHistory.changedAt))
		.limit(limit);
}

export async function listAllForTree() {
	return db
		.select({
			id: asset.id,
			tag: asset.tag,
			name: asset.name,
			classCode: asset.classCode,
			parentId: asset.parentId
		})
		.from(asset)
		.orderBy(asc(asset.tag));
}

export async function listAssessmentsFor(assetId: string) {
	return db
		.select()
		.from(assetAssessment)
		.where(eq(assetAssessment.assetId, assetId))
		.orderBy(desc(assetAssessment.assessedOn), desc(assetAssessment.createdAt));
}

export async function listAssetsForGraph() {
	// v3.1: criticality / lifecycle_state are read from the attributes JSONB
	// (they moved off the asset row in migration 013). Kept on the graph node
	// data so the existing stylesheet's border-width and opacity rules keep
	// working for equipment classes that still populate these keys.
	const latest = latestAssessmentSubquery();
	return db
		.select({
			id: asset.id,
			tag: asset.tag,
			name: asset.name,
			classCode: asset.classCode,
			criticality: sql<number | null>`NULLIF(${asset.attributes}->>'criticality', '')::int`.as(
				'criticality'
			),
			lifecycleState: sql<string | null>`${asset.attributes}->>'lifecycle_state'`.as(
				'lifecycle_state'
			),
			parentId: asset.parentId,
			latestCondition: latest.conditionRating,
			latestAssessmentStatus: latest.status
		})
		.from(asset)
		.leftJoin(latest, and(eq(latest.assetId, asset.id), eq(latest.rn, 1)))
		.orderBy(asc(asset.tag));
}

/**
 * Walk parent_id up to find the SITE ancestor of `assetId`.
 * Returns the SITE asset's id, or null if the chain has no SITE.
 *
 * The asset register has no `site_id` column — sites are modelled as assets
 * with `class_code='SITE'`. One recursive CTE, indexed via `idx_asset_parent_id`.
 */
export async function siteAssetIdFor(assetId: string): Promise<string | null> {
	const rows = await sqlClient<{ id: string }[]>`
		WITH RECURSIVE chain AS (
			SELECT id, class_code, parent_id FROM asset WHERE id = ${assetId}
			UNION ALL
			SELECT a.id, a.class_code, a.parent_id
			FROM asset a JOIN chain ON a.id = chain.parent_id
			WHERE chain.class_code <> 'SITE'
		)
		SELECT id FROM chain WHERE class_code = 'SITE' LIMIT 1
	`;
	return rows[0]?.id ?? null;
}

export type VersionChainEntry = {
	id: string;
	tag: string;
	name: string;
	version: string | null;
};

export type VersionChain = {
	predecessors: VersionChainEntry[]; // older → newer (excluding current)
	current: VersionChainEntry;
	successors: VersionChainEntry[]; // newest → oldest (i.e. rows that supersede this one)
};

/**
 * Walk supersedes_asset_id in BOTH directions starting from `assetId`.
 *
 * Predecessors: this row's supersedes_asset_id, then THAT row's
 * supersedes_asset_id, etc. — older versions.
 *
 * Successors: rows whose supersedes_asset_id = this row's id, then rows that
 * supersede THOSE, etc. — newer versions branching off.
 *
 * Returns null when the asset doesn't exist. Returns a chain of length 1
 * (just `current`, both arrays empty) when the row isn't part of any chain.
 *
 * Two recursive CTEs in a single round-trip.
 */
export async function getVersionChain(assetId: string): Promise<VersionChain | null> {
	const rows = await sqlClient<
		{ id: string; tag: string; name: string; version: string | null; direction: 'self' | 'older' | 'newer'; depth: number }[]
	>`
		WITH RECURSIVE
		older AS (
			SELECT id, tag, name, version, supersedes_asset_id, 1 AS depth
			FROM asset
			WHERE id = (SELECT supersedes_asset_id FROM asset WHERE id = ${assetId})
			UNION ALL
			SELECT a.id, a.tag, a.name, a.version, a.supersedes_asset_id, older.depth + 1
			FROM asset a JOIN older ON a.id = older.supersedes_asset_id
		),
		newer AS (
			SELECT id, tag, name, version, 1 AS depth
			FROM asset
			WHERE supersedes_asset_id = ${assetId}
			UNION ALL
			SELECT a.id, a.tag, a.name, a.version, newer.depth + 1
			FROM asset a JOIN newer ON a.supersedes_asset_id = newer.id
		)
		SELECT id, tag, name, version, 'self'::text AS direction, 0 AS depth
		FROM asset WHERE id = ${assetId}
		UNION ALL
		SELECT id, tag, name, version, 'older'::text AS direction, depth FROM older
		UNION ALL
		SELECT id, tag, name, version, 'newer'::text AS direction, depth FROM newer
	`;

	const self = rows.find((r) => r.direction === 'self');
	if (!self) return null;

	const predecessors = rows
		.filter((r) => r.direction === 'older')
		.sort((a, b) => b.depth - a.depth) // oldest first
		.map(({ id, tag, name, version }) => ({ id, tag, name, version }));
	const successors = rows
		.filter((r) => r.direction === 'newer')
		.sort((a, b) => b.depth - a.depth) // newest first
		.map(({ id, tag, name, version }) => ({ id, tag, name, version }));
	const current: VersionChainEntry = {
		id: self.id,
		tag: self.tag,
		name: self.name,
		version: self.version
	};

	return { predecessors, current, successors };
}

/** Set `app.changed_by` for the current transaction so the history trigger picks it up. */
export async function setChangedBy(
	tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
	who: string
) {
	await tx.execute(sql`SELECT set_config('app.changed_by', ${who}, true)`);
}
