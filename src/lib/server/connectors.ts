import { asc, eq } from 'drizzle-orm';
import { db } from './db';
import { assetDocument, connector } from './db/schema';

export async function listConnectors(opts: { enabledOnly?: boolean } = {}) {
	const q = db.select().from(connector).orderBy(asc(connector.name));
	if (opts.enabledOnly) {
		return q.where(eq(connector.enabled, true));
	}
	return q;
}

export async function getConnector(id: string) {
	const rows = await db.select().from(connector).where(eq(connector.id, id)).limit(1);
	return rows[0] ?? null;
}

export async function getConnectorByName(name: string) {
	const rows = await db.select().from(connector).where(eq(connector.name, name)).limit(1);
	return rows[0] ?? null;
}

/** Returns true if any asset_document still references this connector. */
export async function connectorHasLinkedDocs(id: string): Promise<boolean> {
	const rows = await db
		.select({ id: assetDocument.id })
		.from(assetDocument)
		.where(eq(assetDocument.connectorId, id))
		.limit(1);
	return rows.length > 0;
}
