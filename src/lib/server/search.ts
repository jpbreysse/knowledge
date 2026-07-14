import { asc, ilike, or, sql } from 'drizzle-orm';
import { db, sqlClient } from './db';
import { asset, assetClass, connector } from './db/schema';

const LIMIT = 8;

export type SearchHit = {
	kind: 'asset' | 'asset-type' | 'connector' | 'finding';
	id: string;
	primary: string; // main label
	secondary: string; // context / subtitle
	href: string; // navigation target
};

/**
 * Global search — a single round-trip that hits assets, asset_class,
 * connector, and finding, capped per-section. Used by the Cmd-K palette.
 *
 * Match rules:
 *   asset       — tag / name / any attribute value (attributes::text)
 *   asset_class — code / label / description
 *   connector   — name / label / base_url
 *   finding     — title / cached description HTML
 */
export async function globalSearch(query: string): Promise<{
	assets: SearchHit[];
	assetTypes: SearchHit[];
	connectors: SearchHit[];
	findings: SearchHit[];
}> {
	const q = query.trim();
	if (!q) return { assets: [], assetTypes: [], connectors: [], findings: [] };
	const pattern = `%${q}%`;

	const [assetRows, classRows, connectorRows, findingRows] = await Promise.all([
		db
			.select({
				id: asset.id,
				tag: asset.tag,
				name: asset.name,
				classCode: asset.classCode
			})
			.from(asset)
			.where(
				or(
					ilike(asset.tag, pattern),
					ilike(asset.name, pattern),
					sql`${asset.attributes}::text ILIKE ${pattern}`
				)
			)
			.orderBy(asc(asset.tag))
			.limit(LIMIT),
		db
			.select({
				id: assetClass.id,
				code: assetClass.code,
				label: assetClass.label,
				family: assetClass.family
			})
			.from(assetClass)
			.where(
				or(
					ilike(assetClass.code, pattern),
					ilike(assetClass.label, pattern),
					ilike(assetClass.description, pattern)
				)
			)
			.orderBy(asc(assetClass.code))
			.limit(LIMIT),
		db
			.select({
				id: connector.id,
				name: connector.name,
				label: connector.label,
				baseUrl: connector.baseUrl
			})
			.from(connector)
			.where(
				or(
					ilike(connector.name, pattern),
					ilike(connector.label, pattern),
					ilike(connector.baseUrl, pattern)
				)
			)
			.orderBy(asc(connector.name))
			.limit(LIMIT),
		sqlClient<{ id: string; title: string; severity: string; status: string }[]>`
			SELECT id, title, severity, status FROM finding
			WHERE title ILIKE ${pattern} OR description_html ILIKE ${pattern}
			ORDER BY raised_at DESC
			LIMIT ${LIMIT}
		`
	]);

	return {
		assets: assetRows.map((r) => ({
			kind: 'asset' as const,
			id: r.id,
			primary: r.tag,
			secondary: `${r.name} — ${r.classCode}`,
			href: `/assets/${r.id}`
		})),
		assetTypes: classRows.map((r) => ({
			kind: 'asset-type' as const,
			id: r.id,
			primary: r.code,
			secondary: `${r.label} — ${r.family}`,
			href: `/asset-types/${r.id}`
		})),
		connectors: connectorRows.map((r) => ({
			kind: 'connector' as const,
			id: r.id,
			primary: r.name,
			secondary: `${r.label} — ${r.baseUrl}`,
			href: `/connectors/${r.id}`
		})),
		findings: findingRows.map((r) => ({
			kind: 'finding' as const,
			id: r.id,
			primary: r.title,
			secondary: `${r.severity} — ${r.status}`,
			href: `/findings/${r.id}`
		}))
	};
}
