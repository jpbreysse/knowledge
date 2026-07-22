import { sqlClient as db } from './db';
import { randomUUID } from 'node:crypto';
import { matchTrigger, predicatesHold } from '@arborspace/rule-grammar/evaluate';
import type { NormalizedSpec } from '@arborspace/rule-grammar/normalize';
import { getTypeDef } from './finding-vocab';
import { onRecordEvent, type RecordEvent } from './events';

/**
 * Reasoning evaluator — subscribes to post-commit record events, matches
 * enabled reasoning rules (class-specific or the '*' wildcard), and derives
 * findings as PENDING proposals with full provenance. Async and advisory:
 * every failure is logged, nothing propagates to the write path.
 *
 * Re-fire semantics (frozen, stated in acceptance):
 *   - a PENDING proposal exists for (rule, record)          → touch it, no new row
 *   - an ACCEPTED one exists whose finding isn't closed yet → skip (still being acted on)
 *   - only rejected or closed priors                        → a fresh pending is created
 */

type ReasoningRule = {
	rule_id: string;
	rule_version: number;
	domain_code: string;
	domain_version: number;
	spec: NormalizedSpec & { produces?: string[] };
};

function interpolate(template: string, ctx: Record<string, unknown>): string {
	return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
		const v = ctx[key];
		if (v === undefined || v === null) {
			console.warn(`[reasoning] title template placeholder {${key}} not found — kept literal`);
			return whole;
		}
		return String(v);
	});
}

export async function evaluateReasoningEvent(e: RecordEvent): Promise<void> {
	const rules = await db<ReasoningRule[]>`
		SELECT rule_id, rule_version, domain_code, domain_version, spec
		FROM asset_rule
		WHERE enabled AND enforcement = 'reasoning'
		  AND (class_code = ${e.classCode} OR class_code = '*')
	`;
	if (rules.length === 0) return;

	for (const rule of rules) {
		const spec = rule.spec;
		if (spec.uninterpretable || !spec.trigger) {
			console.error(
				`[reasoning] rule ${rule.rule_id} v${rule.rule_version} is enabled but not interpretable: ${spec.uninterpretable ?? 'no trigger'} — skipped`
			);
			continue;
		}
		if (!matchTrigger(spec, e.new, e.old)) continue;
		if (!predicatesHold(spec, e.new)) continue;

		// The produced type must exist in the loaded vocabulary as a rule product.
		const produces = spec.produces?.[0];
		const typeDef = produces ? await getTypeDef(produces) : null;
		if (!typeDef || typeDef.producer !== 'rule') {
			console.error(
				`[reasoning] rule ${rule.rule_id}: produced type '${produces ?? '?'}' missing from vocabulary or producer!='rule' — no proposal created`
			);
			continue;
		}

		// Dedup / re-fire semantics.
		const existing = await db<{ id: string; review_status: string; status: string }[]>`
			SELECT f.id, f.review_status, f.status
			FROM finding f
			JOIN finding_asset fa ON fa.finding_id = f.id
			WHERE f.rule_id = ${rule.rule_id} AND fa.asset_id = ${e.assetId}::uuid
			  AND (f.review_status = 'pending'
			       OR (f.review_status = 'accepted' AND f.status <> 'closed'))
			LIMIT 1
		`;
		const triggerField = spec.trigger.field;
		const triggerSummary = `${triggerField} updated to ${e.new[triggerField]}`;
		if (existing.length > 0) {
			if (existing[0].review_status === 'pending') {
				await db`
					UPDATE finding SET updated_at = NOW(), trigger_summary = ${triggerSummary}
					WHERE id = ${existing[0].id}
				`;
			}
			continue;
		}

		const title = interpolate(typeDef.title_template ?? typeDef.type, {
			...e.new,
			asset_tag: e.tag,
			tag: e.tag
		});
		const findingId = randomUUID();
		await db`
			INSERT INTO finding
				(id, finding_type, title, severity, status, description_html, attributes,
				 raised_by, review_status, rule_id, rule_version, domain_version, trigger_summary)
			VALUES
				(${findingId}, ${typeDef.type}, ${title},
				 ${typeDef.default_severity ?? spec.severity}, 'raised', '', '{}'::jsonb,
				 ${'rule:' + rule.rule_id}, 'pending',
				 ${rule.rule_id}, ${rule.rule_version}, ${rule.domain_version}, ${triggerSummary})
		`;
		await db`
			INSERT INTO finding_asset (finding_id, asset_id)
			VALUES (${findingId}, ${e.assetId}::uuid)
		`;
		console.log(
			`[reasoning] ${rule.rule_id} v${rule.rule_version} → pending proposal '${title}' on ${e.tag}`
		);
	}
}

// Self-registration — asset-service imports this module for its side effect.
onRecordEvent(evaluateReasoningEvent);
