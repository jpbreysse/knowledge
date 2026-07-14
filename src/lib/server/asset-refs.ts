import { inArray } from 'drizzle-orm';
import { db } from './db';
import { asset, type AssetClass, type AssetClassField } from './db/schema';

/** Lightweight asset shape used by the ref picker for display chips. */
export type AssetRefDisplay = {
	id: string;
	tag: string;
	name: string;
	classCode: string;
};

/**
 * Given a list of asset UUIDs, return a Map keyed by id with display metadata.
 * Used to render selected refs as chips on the form.
 */
export async function resolveAssetRefs(ids: string[]): Promise<Map<string, AssetRefDisplay>> {
	const unique = Array.from(new Set(ids.filter(Boolean)));
	if (unique.length === 0) return new Map();
	const rows = await db
		.select({ id: asset.id, tag: asset.tag, name: asset.name, classCode: asset.classCode })
		.from(asset)
		.where(inArray(asset.id, unique));
	return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Walk a class's ref / array_ref fields against an attributes payload. For
 * each declared ref, verify the target asset(s) exist AND match the field's
 * asset_class_filter (if any).
 *
 * Returns a Record<fieldPath, message> of integrity errors. Empty = OK.
 *
 * This is separate from validateAttributesAgainstFields() because it needs
 * DB access and runs after the synchronous shape check.
 */
export async function validateRefIntegrity(
	classDef: AssetClass,
	attributes: Record<string, unknown>
): Promise<Record<string, string>> {
	const errors: Record<string, string> = {};
	const fields = classDef.attributeFields ?? [];

	// Collect all ref-style ids that need lookup, plus where they came from.
	type Lookup = { fieldName: string; index?: number; expected?: string | string[] };
	const idToLookups = new Map<string, Lookup[]>();

	for (const f of fields) {
		if (f.type === 'ref') {
			const v = attributes[f.name];
			if (typeof v === 'string' && v.length > 0) {
				const list = idToLookups.get(v) ?? [];
				list.push({ fieldName: f.name, expected: f.asset_class_filter });
				idToLookups.set(v, list);
			}
		} else if (f.type === 'array_ref') {
			const v = attributes[f.name];
			if (Array.isArray(v)) {
				v.forEach((item, i) => {
					if (typeof item === 'string' && item.length > 0) {
						const list = idToLookups.get(item) ?? [];
						list.push({ fieldName: f.name, index: i, expected: f.asset_class_filter });
						idToLookups.set(item, list);
					}
				});
			}
		}
	}

	if (idToLookups.size === 0) return errors;

	const resolved = await resolveAssetRefs(Array.from(idToLookups.keys()));

	for (const [id, lookups] of idToLookups.entries()) {
		const row = resolved.get(id);
		for (const lookup of lookups) {
			const errKey =
				lookup.index === undefined
					? `attributes.${lookup.fieldName}`
					: `attributes.${lookup.fieldName}.${lookup.index}`;
			if (!row) {
				errors[errKey] = `asset ${id} not found`;
				continue;
			}
			if (lookup.expected) {
				const allowed = Array.isArray(lookup.expected) ? lookup.expected : [lookup.expected];
				if (!allowed.includes(row.classCode)) {
					errors[errKey] = `must reference class ${allowed.join(' or ')} (got ${row.classCode})`;
				}
			}
		}
	}

	return errors;
}

/**
 * Collect every ref / array_ref UUID present in an asset's attributes given
 * the class definition. Used by page loads to resolve display metadata in
 * one round-trip.
 */
export function collectRefIds(
	fields: AssetClassField[],
	attributes: Record<string, unknown>
): string[] {
	const ids: string[] = [];
	for (const f of fields) {
		if (f.type === 'ref') {
			const v = attributes[f.name];
			if (typeof v === 'string' && v.length > 0) ids.push(v);
		} else if (f.type === 'array_ref') {
			const v = attributes[f.name];
			if (Array.isArray(v)) {
				for (const item of v) {
					if (typeof item === 'string' && item.length > 0) ids.push(item);
				}
			}
		}
	}
	return ids;
}
