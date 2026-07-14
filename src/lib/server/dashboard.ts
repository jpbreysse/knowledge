import { sqlClient } from './db';

export type DashboardStats = {
	totalAssets: number;
	assessedCount: number;
	criticalCount: number;
	capexTotal: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
	const [row] = await sqlClient<
		{ total_assets: number; assessed_count: number; critical_count: number; capex_total: string }[]
	>`
		SELECT
			(SELECT COUNT(*)::int FROM asset) AS total_assets,
			(SELECT COUNT(*)::int FROM asset_assessment
				WHERE status = 'assessed' AND condition_rating IS NOT NULL) AS assessed_count,
			(SELECT COUNT(*)::int
				FROM asset_assessment aa
				CROSS JOIN LATERAL jsonb_array_elements(aa.findings) f
				WHERE aa.status = 'assessed' AND f->>'severity' = 'critical') AS critical_count,
			COALESCE((SELECT SUM(capex_estimate_usd) FROM asset_assessment WHERE status = 'assessed'), 0) AS capex_total
	`;
	return {
		totalAssets: row?.total_assets ?? 0,
		assessedCount: row?.assessed_count ?? 0,
		criticalCount: row?.critical_count ?? 0,
		capexTotal: Number(row?.capex_total ?? 0)
	};
}

export type TopFinding = {
	assetId: string;
	assetTag: string;
	assetName: string;
	title: string;
	detail: string | null;
};

export async function getTopCriticalFindings(limit = 3): Promise<TopFinding[]> {
	const rows = await sqlClient<
		{
			asset_id: string;
			asset_tag: string;
			asset_name: string;
			title: string;
			detail: string | null;
		}[]
	>`
		SELECT
			a.id AS asset_id,
			a.tag AS asset_tag,
			a.name AS asset_name,
			f->>'title' AS title,
			f->>'detail' AS detail
		FROM asset_assessment aa
		JOIN asset a ON a.id = aa.asset_id
		CROSS JOIN LATERAL jsonb_array_elements(aa.findings) f
		WHERE aa.status = 'assessed' AND f->>'severity' = 'critical'
		ORDER BY aa.assessed_on DESC NULLS LAST, a.tag
		LIMIT ${limit}
	`;
	return rows.map((r) => ({
		assetId: r.asset_id,
		assetTag: r.asset_tag,
		assetName: r.asset_name,
		title: r.title,
		detail: r.detail
	}));
}
