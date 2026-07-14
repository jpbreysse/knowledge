/**
 * Read-only data access against the Knowledge app's database (`knowledge`).
 *
 * The Knowledge app owns these tables and writes to them. The Asset app only
 * reads — to surface "findings that concern this asset" on the asset detail
 * page. A separate `postgres()` client is used because Postgres can't JOIN
 * across databases without `postgres_fdw`.
 *
 * Tables touched (read only):
 *   - kn_findings       (id, title, severity, status, finding_type, raised_at, …)
 *   - kn_finding_asset  (finding_id, asset_id, asset_tag, asset_display, linked_at)
 */

import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import { sqlClient as assetSql } from './db';

const url = env.KNOWLEDGE_DATABASE_URL;
if (!url) {
	console.warn(
		'[knowledge] KNOWLEDGE_DATABASE_URL is not set — findings panel will be empty.'
	);
}

// One pool per Node process; stash on globalThis to survive HMR reloads.
const globalForKn = globalThis as unknown as { __knSql?: ReturnType<typeof postgres> };
export const knowledgeSql: ReturnType<typeof postgres> | null = url
	? (globalForKn.__knSql ?? postgres(url, { max: 5 }))
	: null;
if (knowledgeSql && !globalForKn.__knSql) globalForKn.__knSql = knowledgeSql;

export type FindingForAsset = {
	id: string;
	title: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	status: 'raised' | 'reviewed' | 'accepted' | 'mitigated' | 'closed';
	finding_type: string;
	raised_at: Date;
};

/**
 * Returns findings that concern the given asset (by asset UUID), ordered by
 * severity (critical → low) then most recently raised. Capped at `limit`.
 *
 * Returns [] if KNOWLEDGE_DATABASE_URL isn't configured or the query throws —
 * the asset page must remain functional even if Knowledge is offline.
 */
export type PrecedentFinding = {
	id: string;
	title: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	closed_at: Date;
	precedent_asset_tag: string;
	precedent_site_name: string;
	precedent_site_tag: string;
};

const SEVERITY_RANK: Record<string, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3
};

/**
 * Cross-site precedent retrieval.
 *
 * Surfaces closed findings on assets that share `classCode` with the current
 * asset but live under a DIFFERENT SITE. Two-phase because the asset register
 * and the knowledge findings live in separate Postgres databases:
 *   1. asset_dev — find sibling assets (same class_code, different site).
 *      Site is derived by walking parent_id up to a class_code='SITE' ancestor.
 *   2. knowledge — pull their closed kn_findings via kn_finding_asset.
 *
 * Then compose, sort by severity (critical→low) then closed_at desc, slice.
 *
 * Returns [] gracefully if classCode or currentSiteAssetId is null, knowledge
 * isn't configured, or either query throws.
 */
export async function precedentsForAsset(
	classCode: string | null,
	currentSiteAssetId: string | null,
	limit = 5
): Promise<PrecedentFinding[]> {
	if (!classCode || !currentSiteAssetId || !knowledgeSql) return [];

	try {
		// Phase 1 (asset_dev): every asset matching the class whose nearest SITE
		// ancestor is NOT the caller's site. One CTE per leaf walks up parent_id.
		const candidates = await assetSql<
			{ leaf_id: string; leaf_tag: string; site_id: string; site_tag: string; site_name: string }[]
		>`
			WITH RECURSIVE chain AS (
				SELECT id, tag, name, class_code, parent_id, id AS leaf_id, tag AS leaf_tag
				FROM asset
				WHERE class_code = ${classCode}
				UNION ALL
				SELECT a.id, a.tag, a.name, a.class_code, a.parent_id, chain.leaf_id, chain.leaf_tag
				FROM asset a JOIN chain ON a.id = chain.parent_id
				WHERE chain.class_code <> 'SITE'
			)
			SELECT leaf_id, leaf_tag, id AS site_id, tag AS site_tag, name AS site_name
			FROM chain
			WHERE class_code = 'SITE' AND id <> ${currentSiteAssetId}
		`;

		if (candidates.length === 0) return [];

		const candidateMap = new Map(candidates.map((c) => [c.leaf_id, c]));
		const candidateIds = candidates.map((c) => c.leaf_id);

		// Phase 2 (knowledge): closed findings on those assets, sorted server-side.
		const rows = await knowledgeSql<
			{
				id: string;
				title: string;
				severity: 'low' | 'medium' | 'high' | 'critical';
				closed_at: Date;
				asset_id: string;
			}[]
		>`
			SELECT f.id, f.title, f.severity, f.closed_at, fa.asset_id
			FROM kn_findings f
			JOIN kn_finding_asset fa ON fa.finding_id = f.id
			WHERE f.status = 'closed' AND fa.asset_id = ANY(${candidateIds})
			ORDER BY
				CASE f.severity
					WHEN 'critical' THEN 0
					WHEN 'high'     THEN 1
					WHEN 'medium'   THEN 2
					WHEN 'low'      THEN 3
					ELSE 9
				END,
				f.closed_at DESC
			LIMIT ${limit}
		`;

		// Compose with phase-1 metadata. Filter out any orphans defensively
		// (shouldn't happen, but the candidate set is the authoritative join key).
		return rows
			.map((r) => {
				const c = candidateMap.get(r.asset_id);
				if (!c) return null;
				return {
					id: r.id,
					title: r.title,
					severity: r.severity,
					closed_at: r.closed_at,
					precedent_asset_tag: c.leaf_tag,
					precedent_site_name: c.site_name,
					precedent_site_tag: c.site_tag
				};
			})
			.filter((x): x is PrecedentFinding => x !== null);
	} catch (e) {
		console.error('[knowledge] precedentsForAsset failed', e);
		return [];
	}
}

// Keep export to ensure tree-shaking doesn't drop the rank map if used later.
export { SEVERITY_RANK };

export async function findingsForAsset(assetId: string, limit = 10): Promise<FindingForAsset[]> {
	if (!knowledgeSql) return [];
	try {
		const rows = await knowledgeSql<FindingForAsset[]>`
			SELECT
				f.id,
				f.title,
				f.severity,
				f.status,
				f.finding_type,
				f.raised_at
			FROM kn_findings f
			JOIN kn_finding_asset fa ON fa.finding_id = f.id
			WHERE fa.asset_id = ${assetId}
			ORDER BY
				CASE f.severity
					WHEN 'critical' THEN 0
					WHEN 'high'     THEN 1
					WHEN 'medium'   THEN 2
					WHEN 'low'      THEN 3
					ELSE 9
				END,
				f.raised_at DESC
			LIMIT ${limit}
		`;
		return rows;
	} catch (e) {
		console.error('[knowledge] findingsForAsset failed', e);
		return [];
	}
}
