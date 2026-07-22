/**
 * In-process record events — the substrate of the reasoning runtime.
 *
 * Emitted AFTER a write's transaction has committed (never inside it), and
 * dispatched on the next tick with hard fire-and-forget semantics: a handler
 * crash is logged and swallowed — it must NEVER fail or slow the user's
 * write. No HTTP, no queue infra; the reasoning evaluator subscribes here.
 */

export type RecordEvent = {
	kind: 'record_created' | 'record_updated';
	classCode: string;
	assetId: string;
	tag: string;
	old: Record<string, unknown> | null;
	new: Record<string, unknown>;
	actor: string;
};

type Handler = (e: RecordEvent) => Promise<void>;

const handlers: Handler[] = [];

export function onRecordEvent(h: Handler): void {
	handlers.push(h);
}

export function emitRecordEvent(e: RecordEvent): void {
	setImmediate(() => {
		for (const h of handlers) {
			h(e).catch((err) => {
				console.error(`[reasoning] handler failed for ${e.kind} ${e.tag}:`, err);
			});
		}
	});
}
