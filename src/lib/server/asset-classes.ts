import { asc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { asset, assetClass } from './db/schema';

export async function listAssetClasses() {
	return db.select().from(assetClass).orderBy(asc(assetClass.family), asc(assetClass.code));
}

export async function getAssetClass(id: string) {
	const rows = await db.select().from(assetClass).where(eq(assetClass.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function getAssetClassByCode(code: string) {
	const rows = await db.select().from(assetClass).where(eq(assetClass.code, code)).limit(1);
	return rows[0] ?? null;
}

/** Count how many assets currently use a given class code. Used by the list page
 *  and to refuse a delete that would orphan rows. */
export async function assetCountByClass(): Promise<Map<string, number>> {
	const rows = await db
		.select({ code: asset.classCode, n: sql<number>`count(*)::int` })
		.from(asset)
		.groupBy(asset.classCode);
	return new Map(rows.map((r) => [r.code, r.n]));
}

export async function countAssetsForClassCode(code: string): Promise<number> {
	const rows = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(asset)
		.where(eq(asset.classCode, code));
	return rows[0]?.n ?? 0;
}
