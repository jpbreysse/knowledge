import { json } from '@sveltejs/kit';
import { sqlClient as db } from './db';
import type { NormalizedSpec } from './rule-loader';
import { matchTrigger, evalCondition } from '@arborspace/rule-grammar/evaluate';

/**
 * Transaction-rule interpreter — executed by enforceTransactionRules() on
 * every asset create/update (imports included: they persist via createAsset).
 *
 * The pure trigger-match and condition-evaluation logic lives in
 * `@arborspace/rule-grammar/evaluate` (same shapes, byte-identical semantics).
 * This file keeps the app-owned pieces:
 *   1. The DB lookup for enabled rules by class.
 *   2. Fail-closed check on uninterpretable enabled rules (RuleConfigError).
 *   3. Audit-insert into `rule_rejection` before throwing RuleViolationError.
 *   4. Error-to-HTTP mapping via ruleErrorResponse().
 */

export class RuleViolationError extends Error {
	constructor(
		message: string,
		public readonly ruleId: string,
		public readonly ruleVersion: number,
		public readonly domainCode: string,
		public readonly domainVersion: number,
		/** Field the violated condition points at — lets the UI anchor the message. */
		public readonly field: string | null
	) {
		super(message);
		this.name = 'RuleViolationError';
	}
}

export class RuleConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RuleConfigError';
	}
}

type RuleRow = {
	rule_id: string;
	rule_version: number;
	domain_code: string;
	domain_version: number;
	spec: NormalizedSpec;
};

export type RuleEvalContext = {
	action: 'create' | 'update';
	actor: string;
	classCode: string;
	assetId: string | null;
	tag: string;
	newAttributes: Record<string, unknown>;
	oldAttributes: Record<string, unknown> | null;
};

export async function evaluateTransactionRules(ctx: RuleEvalContext): Promise<void> {
	const rules = await db<RuleRow[]>`
		SELECT rule_id, rule_version, domain_code, domain_version, spec
		FROM asset_rule
		WHERE enabled AND enforcement = 'transaction' AND class_code = ${ctx.classCode}
	`;
	if (rules.length === 0) return;

	for (const rule of rules) {
		const spec = rule.spec;
		if (spec.uninterpretable || !spec.trigger) {
			throw new RuleConfigError(
				`transaction rule ${rule.rule_id} v${rule.rule_version} (${rule.domain_code} v${rule.domain_version}) ` +
					`is enabled but not interpretable: ${spec.uninterpretable ?? 'no trigger'} — ` +
					`disable it or republish the domain with a supported shape`
			);
		}

		if (!matchTrigger(spec, ctx.newAttributes, ctx.oldAttributes)) continue;

		const violatedField = evalCondition(spec, ctx.newAttributes);
		if (violatedField === null) continue;

		// Violation: audit first (survives — we're before any write), then block.
		await db`
			INSERT INTO rule_rejection
				(actor, asset_id, asset_tag, class_code, rule_id, rule_version, domain_version, message)
			VALUES
				(${ctx.actor}, ${ctx.assetId}, ${ctx.tag}, ${ctx.classCode},
				 ${rule.rule_id}, ${rule.rule_version}, ${rule.domain_version}, ${spec.message})
		`;
		throw new RuleViolationError(
			spec.message,
			rule.rule_id,
			rule.rule_version,
			rule.domain_code,
			rule.domain_version,
			violatedField
		);
	}
}

/**
 * Map engine errors to HTTP responses in the existing error-body format.
 * Violation → 422 with the message keyed to the offending attribute field
 * (falls back to _root) plus the provenance triple for the UI. Config → 500.
 * Returns null for anything else.
 */
export function ruleErrorResponse(e: unknown): Response | null {
	if (e instanceof RuleViolationError) {
		const key = e.field ? `attributes.${e.field}` : '_root';
		return json(
			{
				errors: { [key]: e.message },
				rule: {
					id: e.ruleId,
					version: e.ruleVersion,
					domain: e.domainCode,
					domainVersion: e.domainVersion
				}
			},
			{ status: 422 }
		);
	}
	if (e instanceof RuleConfigError) {
		return json({ errors: { _root: e.message } }, { status: 500 });
	}
	return null;
}
