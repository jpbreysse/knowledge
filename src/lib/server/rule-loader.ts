import { sqlClient as db } from './db';
import { fetchBundle, postHeartbeat, type Bundle, type BundleRule } from './ontology-client';

/**
 * Load-time pipeline: bundle → normalized transaction rules → asset_rule.
 *
 * Normalization contract (deliberately tiny — the interpreter executes ONLY
 * these two shapes, docs/…/transaction engine prompt):
 *   trigger  { kind: 'field_transition', field, to }
 *   condition{ kind: 'field_empty', field }
 *
 * The current bundles carry a STRUCTURED trigger (event='field_transition')
 * and PROSE predicates; exactly one prose pattern is translated:
 *   "<entity>.<field> is empty"  →  field_empty
 * A predicate that merely restates the trigger's target value is skipped as
 * redundant. Anything else leaves the rule stored but marked uninterpretable
 * — the interpreter fails CLOSED on enabled uninterpretable rules (a blocker
 * we can't evaluate must never be silently ignored).
 */

// Part 2 mapping — ontology entity → asset class. Static and in git on
// purpose: one entity exists today; the generalized connector fabric / class
// loader is explicitly out of scope here.
const ENTITY_CLASS_MAP: Record<string, string> = {
	deliverable: 'IER'
};

export type NormalizedSpec = {
	trigger: { kind: 'field_transition'; field: string; to: string } | null;
	conditions: { kind: 'field_empty'; field: string }[];
	message: string;
	severity: string;
	name: string;
	/** Set when any part of the rule could not be translated — fail-closed marker. */
	uninterpretable?: string;
	/** Original bundle definition, for the /domain debug expander. */
	raw: unknown;
};

const EMPTY_PREDICATE_RE = /^\s*(\w+)\.(\w+)\s+is\s+empty\s*$/i;
const EQUALS_PREDICATE_RE = /^\s*(\w+)\.(\w+)\s*=\s*'([^']*)'\s*$/;

function normalizeRule(rule: BundleRule): { classCode: string | null; spec: NormalizedSpec } {
	const def = rule.definition ?? {};
	const spec: NormalizedSpec = {
		trigger: null,
		conditions: [],
		message: def.action?.message ?? rule.name ?? rule.id,
		severity: rule.severity ?? 'blocker',
		name: rule.name ?? rule.id,
		raw: def
	};

	// Trigger — structured passthrough only.
	const t = def.trigger;
	let entity: string | null = null;
	if (t?.event === 'field_transition' && t.field && typeof t.to === 'string') {
		spec.trigger = { kind: 'field_transition', field: t.field, to: t.to };
		entity = t.entity ?? null;
	} else {
		spec.uninterpretable = `trigger event '${t?.event ?? 'missing'}' is not a known shape`;
	}

	// Predicates — translate emptiness; skip the one that restates the trigger.
	for (const p of def.query?.predicates ?? []) {
		const empty = EMPTY_PREDICATE_RE.exec(p);
		if (empty) {
			spec.conditions.push({ kind: 'field_empty', field: empty[2] });
			entity = entity ?? empty[1];
			continue;
		}
		const eq = EQUALS_PREDICATE_RE.exec(p);
		if (eq && spec.trigger && eq[2] === spec.trigger.field && eq[3] === spec.trigger.to) {
			continue; // redundant restatement of the trigger target
		}
		spec.uninterpretable = `predicate not translatable: "${p}"`;
	}

	const classCode = entity ? (ENTITY_CLASS_MAP[entity] ?? null) : null;
	return { classCode, spec };
}

export type LoadResult = {
	domain: string;
	version: number;
	hash: string;
	loaded: { ruleId: string; classCode: string; uninterpretable?: string }[];
	disabled: number;
};

export async function loadDomainVersion(
	domainCode: string,
	version: number | 'latest'
): Promise<LoadResult> {
	const bundle: Bundle = await fetchBundle(domainCode, version);
	const domain = bundle.domain ?? bundle.code ?? domainCode;
	const v = bundle.version;
	const hash = bundle.content_hash ?? bundle.hash ?? '';
	if (!v || !hash) throw new Error('bundle is missing version or content hash');

	const txRules = (bundle.rules ?? []).filter((r) => r.enforcement === 'transaction');

	const loaded: LoadResult['loaded'] = [];
	for (const rule of txRules) {
		const { classCode, spec } = normalizeRule(rule);
		if (!classCode) {
			// Part 2 STOP path: an entity we can't map is a config error, not a guess.
			throw new Error(
				`rule ${rule.id}: no asset-class mapping for its target entity — extend ENTITY_CLASS_MAP`
			);
		}
		await db`
			INSERT INTO asset_rule
				(rule_id, rule_version, domain_code, domain_version, content_hash, class_code, spec, enabled)
			VALUES
				(${rule.id}, ${rule.version ?? 1}, ${domain}, ${v}, ${hash}, ${classCode},
				 ${JSON.stringify(spec)}::jsonb, TRUE)
			ON CONFLICT ON CONSTRAINT asset_rule_identity DO UPDATE
				SET content_hash = EXCLUDED.content_hash,
				    class_code   = EXCLUDED.class_code,
				    spec         = EXCLUDED.spec,
				    enabled      = TRUE,
				    loaded_at    = NOW()
		`;
		loaded.push({ ruleId: rule.id, classCode, uninterpretable: spec.uninterpretable });
	}

	// One active version per domain: everything not from THIS load is disabled
	// (kept for provenance — vanished rules simply never re-enable).
	const res = await db`
		UPDATE asset_rule SET enabled = FALSE
		WHERE domain_code = ${domain} AND domain_version <> ${v} AND enabled
	`;

	// Non-blocking consumer heartbeat.
	void postHeartbeat(domain, v, hash);

	return { domain, version: v, hash, loaded, disabled: res.count };
}

export type ActiveRuleRow = {
	rule_id: string;
	rule_version: number;
	domain_code: string;
	domain_version: number;
	content_hash: string;
	class_code: string;
	spec: NormalizedSpec;
	enabled: boolean;
	loaded_at: Date;
};

export async function listRules(): Promise<ActiveRuleRow[]> {
	return db<ActiveRuleRow[]>`
		SELECT rule_id, rule_version, domain_code, domain_version, content_hash,
		       class_code, spec, enabled, loaded_at
		FROM asset_rule
		ORDER BY enabled DESC, domain_version DESC, rule_id
	`;
}

export async function currentDomainState(): Promise<{
	domain_code: string;
	domain_version: number;
	content_hash: string;
	rules: number;
} | null> {
	const rows = await db<
		{ domain_code: string; domain_version: number; content_hash: string; rules: number }[]
	>`
		SELECT domain_code, domain_version, content_hash, count(*)::int AS rules
		FROM asset_rule WHERE enabled
		GROUP BY 1, 2, 3
		ORDER BY domain_version DESC
		LIMIT 1
	`;
	return rows[0] ?? null;
}
