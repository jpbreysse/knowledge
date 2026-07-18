import { eq } from 'drizzle-orm';
import { db } from './db';
import { asset, type Asset, type AssetClass } from './db/schema';
import { getAssetClassByCode } from './asset-classes';
import { validateRefIntegrity } from './asset-refs';
import { validateAsset, type Validated } from './validation';
import { renderTiptapHtml } from './tiptap';
import { getAsset, setChangedBy } from './assets';
import { evaluateTransactionRules } from './rules-engine';

/**
 * Single write choke point for the `asset` table.
 *
 * Every runtime write — POST /api/assets, PATCH /api/assets/[id], and the CSV
 * import commit — goes through createAsset()/updateAsset(). Seeds are the one
 * named exception (raw psql fixtures, see seed/ headers).
 *
 * Pipeline: class lookup → shape validation → ref integrity → rule hook →
 * transaction (GUC actor + write). Known DB errors come back as typed
 * WriteErr; anything unexpected is rethrown for the handler to deal with.
 */

export type WriteOk = { ok: true; row: Asset };
export type WriteErr = { ok: false; status: 400 | 404 | 409; errors: Record<string, string> };
export type WriteResult = WriteOk | WriteErr;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbConn = typeof db | Tx;

/** Run fn inside conn if it's already a transaction, else open one. */
function withTx<T>(conn: DbConn, fn: (tx: Tx) => Promise<T>): Promise<T> {
	// drizzle transactions expose rollback(); the root db object doesn't.
	if ('rollback' in conn) return fn(conn as Tx);
	return (conn as typeof db).transaction(fn);
}

type RuleContext = {
	action: 'create' | 'update';
	actor: string;
	classDef: AssetClass | null;
	value: Validated['value'];
	/** Set on update only. */
	assetId?: string;
	/** The record's current state on updates; null on create. */
	old: Asset | null;
};

/**
 * Transaction-rule enforcement — runs after validation, before any write
 * (so a refusal leaves nothing behind, and the rejection audit survives).
 * Rules are loaded from published ontology bundles via /domain; with none
 * loaded for the class this is one indexed SELECT and returns immediately.
 * Throws RuleViolationError (→ 422) or RuleConfigError (→ 500) upward.
 */
async function enforceTransactionRules(ctx: RuleContext): Promise<void> {
	if (!ctx.classDef) return;
	await evaluateTransactionRules({
		action: ctx.action,
		actor: ctx.actor,
		classCode: ctx.classDef.code,
		assetId: ctx.assetId ?? null,
		tag: ctx.value.tag,
		newAttributes: ctx.value.attributes,
		oldAttributes: (ctx.old?.attributes as Record<string, unknown> | null) ?? null
	});
}

/**
 * Walk the error's cause chain for the underlying PostgresError — drizzle
 * wraps DB failures in DrizzleQueryError whose own .message is just the SQL
 * (same pattern as pgErrorInfo in the entity-links route).
 */
function pgError(e: unknown): { code?: string; constraint?: string; message: string } {
	const seen = new Set<unknown>();
	let cur: unknown = e;
	let message = '';
	while (cur && typeof cur === 'object' && !seen.has(cur)) {
		seen.add(cur);
		const o = cur as Record<string, unknown>;
		if (typeof o.message === 'string') message = o.message;
		if (typeof o.code === 'string' || typeof o.constraint_name === 'string') {
			return {
				code: o.code as string | undefined,
				constraint: o.constraint_name as string | undefined,
				message
			};
		}
		cur = o.cause ?? o.original ?? null;
	}
	return { message };
}

function mapDbError(e: unknown): WriteErr | null {
	const info = pgError(e);
	const hay = `${info.constraint ?? ''} ${info.message}`;
	if (info.code === '23505' || hay.includes('asset_tag_unique') || hay.includes('duplicate key'))
		return { ok: false, status: 409, errors: { tag: 'tag already exists' } };
	if (info.code === '23503' && hay.includes('asset_parent_id_fkey'))
		return { ok: false, status: 400, errors: { parent_id: 'parent not found' } };
	if (hay.includes('asset_parent_id_fkey'))
		return { ok: false, status: 400, errors: { parent_id: 'parent not found' } };
	return null;
}

function extractClassCode(input: unknown): string | null {
	if (input && typeof input === 'object' && typeof (input as { class_code?: unknown }).class_code === 'string')
		return (input as { class_code: string }).class_code;
	return null;
}

/**
 * Validate and insert one asset. `conn` lets a caller that owns a wider
 * transaction (the CSV import batch) pass it through so all rows commit or
 * roll back together; by default the service opens its own.
 */
export async function createAsset(
	input: unknown,
	actor: string,
	conn: DbConn = db
): Promise<WriteResult> {
	const classCode = extractClassCode(input);
	const classDef = classCode ? await getAssetClassByCode(classCode) : null;

	const parsed = validateAsset(input, classDef);
	if (!parsed.ok) return { ok: false, status: 400, errors: parsed.errors };
	const v = parsed.value;

	if (classDef) {
		const refErrors = await validateRefIntegrity(classDef, v.attributes);
		if (Object.keys(refErrors).length > 0) return { ok: false, status: 400, errors: refErrors };
	}

	const contentHtml = v.content ? renderTiptapHtml(v.content) : null;

	await enforceTransactionRules({ action: 'create', actor, classDef, value: v, old: null });

	try {
		const row = await withTx(conn, async (tx) => {
			await setChangedBy(tx, actor);
			const [inserted] = await tx
				.insert(asset)
				.values({
					tag: v.tag,
					name: v.name,
					classCode: v.classCode,
					attributes: v.attributes,
					content: v.content,
					contentHtml,
					parentId: v.parentId,
					confidentiality: v.confidentiality,
					version: v.version,
					supersedesAssetId: v.supersedesAssetId,
					updatedBy: actor
				})
				.returning();
			return inserted;
		});
		return { ok: true, row };
	} catch (e) {
		const mapped = mapDbError(e);
		if (mapped) return mapped;
		throw e;
	}
}

/**
 * Validate and fully replace one asset (PATCH today has PUT semantics: the
 * body must be a complete AssetInput; there is no partial merge).
 */
export async function updateAsset(id: string, input: unknown, actor: string): Promise<WriteResult> {
	const classCode = extractClassCode(input);
	const classDef = classCode ? await getAssetClassByCode(classCode) : null;

	const parsed = validateAsset(input, classDef);
	if (!parsed.ok) return { ok: false, status: 400, errors: parsed.errors };
	const v = parsed.value;

	if (v.parentId && v.parentId === id)
		return { ok: false, status: 400, errors: { parent_id: 'cannot reference self' } };
	if (v.supersedesAssetId && v.supersedesAssetId === id)
		return { ok: false, status: 400, errors: { supersedes_asset_id: 'cannot supersede itself' } };

	if (classDef) {
		const refErrors = await validateRefIntegrity(classDef, v.attributes);
		if (Object.keys(refErrors).length > 0) return { ok: false, status: 400, errors: refErrors };
	}

	const contentHtml = v.content ? renderTiptapHtml(v.content) : null;

	// The hook needs the record's current state (field_transition triggers
	// compare old vs new); PATCH itself is full-replace and never needed it.
	const oldRow = await getAsset(id);
	if (!oldRow) return { ok: false, status: 404, errors: {} };

	await enforceTransactionRules({ action: 'update', actor, classDef, value: v, assetId: id, old: oldRow });

	try {
		const row = await db.transaction(async (tx) => {
			await setChangedBy(tx, actor);
			const [updated] = await tx
				.update(asset)
				.set({
					tag: v.tag,
					name: v.name,
					classCode: v.classCode,
					attributes: v.attributes,
					content: v.content,
					contentHtml,
					parentId: v.parentId,
					confidentiality: v.confidentiality,
					version: v.version,
					supersedesAssetId: v.supersedesAssetId,
					updatedBy: actor
				})
				.where(eq(asset.id, id))
				.returning();
			return updated;
		});
		if (!row) return { ok: false, status: 404, errors: {} };
		return { ok: true, row };
	} catch (e) {
		const mapped = mapDbError(e);
		if (mapped) return mapped;
		throw e;
	}
}
