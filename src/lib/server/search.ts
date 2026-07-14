import { and, asc, ilike, or, sql } from 'drizzle-orm';
import { db, sqlClient } from './db';
import { asset, assetClass, assetDocument, connector } from './db/schema';
import type { Fragment } from 'postgres';

const LIMIT = 8;
// Overfetch so ranking has something to work with, then slice per section.
const FETCH = 24;

export type SearchHit = {
	kind: 'asset' | 'asset-type' | 'connector' | 'finding' | 'document';
	id: string;
	primary: string; // main label
	secondary: string; // context / subtitle
	href: string; // navigation target
};

/** Split a query into terms — every term must match (AND), in any order. */
function splitTerms(query: string): string[] {
	return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * Relevance ranking, applied per section in JS over the overfetched rows:
 *   0 — primary label equals the whole query
 *   1 — primary label starts with the query
 *   2 — primary label contains the query
 *   3 — secondary text (name/subtitle) contains the query
 *   4 — matched only via attributes / description
 * Ties break alphabetically. Exact tag/title matches float to the top instead
 * of drowning in incidental attribute matches.
 */
function rank(hits: SearchHit[], query: string): SearchHit[] {
	const lq = query.trim().toLowerCase();
	const score = (h: SearchHit) => {
		const p = h.primary.toLowerCase();
		if (p === lq) return 0;
		if (p.startsWith(lq)) return 1;
		if (p.includes(lq)) return 2;
		if (h.secondary.toLowerCase().includes(lq)) return 3;
		return 4;
	};
	return hits
		.map((h) => [score(h), h] as const)
		.sort((a, b) => a[0] - b[0] || a[1].primary.localeCompare(b[1].primary))
		.slice(0, LIMIT)
		.map(([, h]) => h);
}

/**
 * Global search — one round-trip across assets, asset types, connectors,
 * findings, and document filenames. Terms are AND-ed (order-free), sections
 * ranked exact → prefix → contains → incidental. Used by the Cmd-K palette.
 *
 * Match rules:
 *   asset       — tag / name / any attribute value (attributes::text)
 *   asset_class — code / label / description
 *   connector   — name / label / base_url
 *   finding     — title / cached description HTML
 *   document    — filename (uploaded and linked); navigates to the asset
 */
export async function globalSearch(query: string): Promise<{
	assets: SearchHit[];
	assetTypes: SearchHit[];
	connectors: SearchHit[];
	findings: SearchHit[];
	documents: SearchHit[];
}> {
	const q = query.trim();
	const ts = splitTerms(q);
	if (ts.length === 0)
		return { assets: [], assetTypes: [], connectors: [], findings: [], documents: [] };
	const patterns = ts.map((t) => `%${t}%`);

	// Raw-SQL AND fragments for the finding query.
	const findingWhere: Fragment = patterns
		.map((p) => sqlClient`(title ILIKE ${p} OR description_html ILIKE ${p})`)
		.reduce<Fragment>(
			(acc, c, i) => (i === 0 ? sqlClient`WHERE ${c}` : sqlClient`${acc} AND ${c}`),
			sqlClient``
		);

	const [assetRows, classRows, connectorRows, findingRows, documentRows] = await Promise.all([
		db
			.select({
				id: asset.id,
				tag: asset.tag,
				name: asset.name,
				classCode: asset.classCode
			})
			.from(asset)
			.where(
				and(
					...patterns.map((p) =>
						or(
							ilike(asset.tag, p),
							ilike(asset.name, p),
							sql`${asset.attributes}::text ILIKE ${p}`
						)
					)
				)
			)
			.orderBy(asc(asset.tag))
			.limit(FETCH),
		db
			.select({
				id: assetClass.id,
				code: assetClass.code,
				label: assetClass.label,
				family: assetClass.family
			})
			.from(assetClass)
			.where(
				and(
					...patterns.map((p) =>
						or(
							ilike(assetClass.code, p),
							ilike(assetClass.label, p),
							ilike(assetClass.description, p)
						)
					)
				)
			)
			.orderBy(asc(assetClass.code))
			.limit(FETCH),
		db
			.select({
				id: connector.id,
				name: connector.name,
				label: connector.label,
				baseUrl: connector.baseUrl
			})
			.from(connector)
			.where(
				and(
					...patterns.map((p) =>
						or(ilike(connector.name, p), ilike(connector.label, p), ilike(connector.baseUrl, p))
					)
				)
			)
			.orderBy(asc(connector.name))
			.limit(FETCH),
		sqlClient<{ id: string; title: string; severity: string; status: string }[]>`
			SELECT id, title, severity, status FROM finding
			${findingWhere}
			ORDER BY raised_at DESC
			LIMIT ${FETCH}
		`,
		db
			.select({
				id: assetDocument.id,
				filename: assetDocument.filename,
				assetId: assetDocument.assetId,
				assetTag: asset.tag,
				assetName: asset.name
			})
			.from(assetDocument)
			.innerJoin(asset, sql`${asset.id} = ${assetDocument.assetId}`)
			.where(and(...patterns.map((p) => ilike(assetDocument.filename, p))))
			.orderBy(asc(assetDocument.filename))
			.limit(FETCH)
	]);

	return {
		assets: rank(
			assetRows.map((r) => ({
				kind: 'asset' as const,
				id: r.id,
				primary: r.tag,
				secondary: `${r.name} — ${r.classCode}`,
				href: `/assets/${r.id}`
			})),
			q
		),
		assetTypes: rank(
			classRows.map((r) => ({
				kind: 'asset-type' as const,
				id: r.id,
				primary: r.code,
				secondary: `${r.label} — ${r.family}`,
				href: `/asset-types/${r.id}`
			})),
			q
		),
		connectors: rank(
			connectorRows.map((r) => ({
				kind: 'connector' as const,
				id: r.id,
				primary: r.name,
				secondary: `${r.label} — ${r.baseUrl}`,
				href: `/connectors/${r.id}`
			})),
			q
		),
		findings: rank(
			findingRows.map((r) => ({
				kind: 'finding' as const,
				id: r.id,
				primary: r.title,
				secondary: `${r.severity} — ${r.status}`,
				href: `/findings/${r.id}`
			})),
			q
		),
		documents: rank(
			documentRows.map((r) => ({
				kind: 'document' as const,
				id: r.id,
				primary: r.filename,
				secondary: `on ${r.assetTag} — ${r.assetName}`,
				href: `/assets/${r.assetId}`
			})),
			q
		)
	};
}
