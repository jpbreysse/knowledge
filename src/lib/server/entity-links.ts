import { alias } from 'drizzle-orm/pg-core';
import { desc, eq, or } from 'drizzle-orm';
import { db } from './db';
import { asset, entityLink, type EntityLink } from './db/schema';

export const ENTITY_LINK_RELATIONS = ['participates_in'] as const;
export type EntityLinkRelation = (typeof ENTITY_LINK_RELATIONS)[number];

export type LinkedAssetRef = {
	id: string;
	tag: string;
	name: string;
	classCode: string;
};

export type LinkedEdge = {
	id: string;
	relation_type: string;
	createdAt: Date;
	target?: LinkedAssetRef;
	source?: LinkedAssetRef;
};

/**
 * Return both incoming and outgoing entity_links for `assetId`, each with the
 * other endpoint asset's tag/name/classCode joined in for chip display.
 * One round-trip per direction (2 queries total).
 */
export async function linksForAsset(assetId: string): Promise<{
	outgoing: LinkedEdge[];
	incoming: LinkedEdge[];
}> {
	// Outgoing: this asset is the source, join target-side asset details.
	const targetAsset = alias(asset, 'target_asset');
	const outgoing = await db
		.select({
			id: entityLink.id,
			relation_type: entityLink.relationType,
			createdAt: entityLink.createdAt,
			target: {
				id: targetAsset.id,
				tag: targetAsset.tag,
				name: targetAsset.name,
				classCode: targetAsset.classCode
			}
		})
		.from(entityLink)
		.innerJoin(targetAsset, eq(targetAsset.id, entityLink.targetId))
		.where(eq(entityLink.sourceId, assetId))
		.orderBy(desc(entityLink.createdAt));

	// Incoming: this asset is the target, join source-side asset details.
	const sourceAsset = alias(asset, 'source_asset');
	const incoming = await db
		.select({
			id: entityLink.id,
			relation_type: entityLink.relationType,
			createdAt: entityLink.createdAt,
			source: {
				id: sourceAsset.id,
				tag: sourceAsset.tag,
				name: sourceAsset.name,
				classCode: sourceAsset.classCode
			}
		})
		.from(entityLink)
		.innerJoin(sourceAsset, eq(sourceAsset.id, entityLink.sourceId))
		.where(eq(entityLink.targetId, assetId))
		.orderBy(desc(entityLink.createdAt));

	return { outgoing, incoming };
}

/** Read every entity_link row — used by /api/graph for the typed-edge overlay. */
export async function listAllEntityLinks(): Promise<EntityLink[]> {
	return db.select().from(entityLink).orderBy(desc(entityLink.createdAt));
}
