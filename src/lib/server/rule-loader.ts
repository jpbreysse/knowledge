import { sqlClient as db } from './db';
import { fetchBundle, postHeartbeat, type Bundle } from './ontology-client';
import { normalizeRule, type NormalizedSpec } from '@arborspace/rule-grammar/normalize';
import { upsertVocabulary } from './finding-vocab';

/**
 * Load-time pipeline: bundle → normalized transaction rules → asset_rule.
 *
 * The grammar-v1 normalizer (bundle rule → {entity, NormalizedSpec}) is now
 * in `@arborspace/rule-grammar/normalize` — behavior unchanged. This file
 * keeps the app-owned pieces:
 *   1. `ENTITY_CLASS_MAP` — ontology-entity → asset-class routing. Static
 *      and in git on purpose (one entity today; a generalized connector
 *      fabric is explicitly out of scope).
 *   2. `loadDomainVersion` — bundle fetch + normalize + DB upsert + heartbeat.
 *   3. `listRules`, `currentDomainState` — DB reads for the /domain page.
 */

const ENTITY_CLASS_MAP: Record<string, string> = {
	deliverable: 'IER',
	// Reasoning rules on the generic 'asset' entity apply to every class —
	// stored as the wildcard '*' (the evaluator matches class OR '*'; the
	// transaction interpreter never sees these rows: enforcement filter).
	asset: '*'
};

export type { NormalizedSpec };

export type LoadResult = {
	domain: string;
	version: number;
	hash: string;
	loaded: { ruleId: string; classCode: string; uninterpretable?: string }[];
	disabled: number;
	vocabulary: { direct: number; derived: number; missing: number };
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

	// Grammar gate: absent = pre-grammar bundle (accepted); >1 = refuse loudly.
	const gv = bundle.grammar_version;
	if (gv !== undefined && gv > 1) {
		throw new Error(`bundle requires grammar v${gv}; this app supports v1`);
	}

	const rules = (bundle.rules ?? []).filter(
		(r) => r.enforcement === 'transaction' || r.enforcement === 'reasoning'
	);

	const loaded: LoadResult['loaded'] = [];
	for (const rule of rules) {
		const { entity, spec } = normalizeRule(rule);
		// Reasoning rules carry what they produce (derived finding type) —
		// stored inside the spec JSONB alongside the normalized shapes.
		const storedSpec = {
			...spec,
			produces: rule.definition?.produces ?? (rule.definition?.action?.finding_type ? [rule.definition.action.finding_type] : [])
		};
		const classCode = entity ? (ENTITY_CLASS_MAP[entity] ?? null) : null;
		if (!classCode) {
			if (rule.enforcement === 'reasoning') {
				// Out-of-scope reasoning rules (e.g. R-lender-memory: its link_created
				// event shape doesn't exist here yet) are skipped with a log — they
				// are advisory and must not abort the load.
				console.warn(
					`[domain] reasoning rule ${rule.id} skipped: no mapping for entity '${entity ?? '?'}'`
				);
				continue;
			}
			// Transaction rules: an entity we can't map is a config error, not a guess.
			throw new Error(
				`rule ${rule.id}: no asset-class mapping for its target entity — extend ENTITY_CLASS_MAP`
			);
		}
		await db`
			INSERT INTO asset_rule
				(rule_id, rule_version, domain_code, domain_version, content_hash, class_code, spec, enabled, enforcement)
			VALUES
				(${rule.id}, ${rule.version ?? 1}, ${domain}, ${v}, ${hash}, ${classCode},
				 ${JSON.stringify(storedSpec)}::jsonb, TRUE, ${rule.enforcement ?? 'transaction'})
			ON CONFLICT ON CONSTRAINT asset_rule_identity DO UPDATE
				SET content_hash = EXCLUDED.content_hash,
				    class_code   = EXCLUDED.class_code,
				    spec         = EXCLUDED.spec,
				    enabled      = TRUE,
				    enforcement  = EXCLUDED.enforcement,
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

	// Finding-type vocabulary (direct offered on /findings/new, derived stored
	// for the future review inbox).
	const vocabulary = await upsertVocabulary(bundle, domain, v, hash);

	// Non-blocking consumer heartbeats — one per consuming module.
	void postHeartbeat(domain, v, hash, 'asset-app');
	void postHeartbeat(domain, v, hash, 'findings-app');

	return { domain, version: v, hash, loaded, disabled: res.count, vocabulary };
}

export type ActiveRuleRow = {
	rule_id: string;
	rule_version: number;
	domain_code: string;
	domain_version: number;
	content_hash: string;
	class_code: string;
	spec: NormalizedSpec & { produces?: string[] };
	enabled: boolean;
	enforcement: 'transaction' | 'reasoning';
	loaded_at: Date;
};

export async function listRules(): Promise<ActiveRuleRow[]> {
	return db<ActiveRuleRow[]>`
		SELECT rule_id, rule_version, domain_code, domain_version, content_hash,
		       class_code, spec, enabled, enforcement, loaded_at
		FROM asset_rule
		ORDER BY enabled DESC, enforcement, domain_version DESC, rule_id
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
