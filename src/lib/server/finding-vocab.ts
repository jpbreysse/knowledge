import { sqlClient as db } from './db';
import type { Bundle } from './ontology-client';

/**
 * Finding-type vocabulary from published domain bundles (migration 018).
 *
 * The bundle carries finding_types: { direct: [...], derived: [...] }.
 * Direct types drive /findings/new (picker, default severity, guidance,
 * required_fields enforcement). Derived types are stored for the future
 * review inbox and never offered for manual creation.
 */

export type BundleFindingType = {
	type: string;
	description?: string;
	guidance?: string;
	producer?: string;
	default_severity?: string;
	title_template?: string;
	decider_role?: string;
	required_fields?: string[];
	deprecated?: boolean;
};

export type FindingTypeDef = {
	type: string;
	kind: 'direct' | 'derived';
	domain_code: string;
	domain_version: number;
	description: string | null;
	guidance: string | null;
	producer: string | null;
	default_severity: string | null;
	title_template: string | null;
	decider_role: string | null;
	required_fields: string[];
	deprecated: boolean;
	missing_from_bundle: boolean;
};

export async function upsertVocabulary(
	bundle: Bundle,
	domain: string,
	version: number,
	hash: string
): Promise<{ direct: number; derived: number; missing: number }> {
	const ft = (bundle.finding_types ?? {}) as {
		direct?: BundleFindingType[];
		derived?: BundleFindingType[];
	};
	const direct = ft.direct ?? [];
	const derived = ft.derived ?? [];
	const present: string[] = [];

	for (const [kind, list] of [
		['direct', direct],
		['derived', derived]
	] as const) {
		for (const t of list) {
			if (!t.type) continue;
			present.push(t.type);
			await db`
				INSERT INTO finding_type_def
					(type, kind, domain_code, domain_version, content_hash, description, guidance,
					 producer, default_severity, title_template, decider_role, required_fields,
					 deprecated, missing_from_bundle)
				VALUES
					(${t.type}, ${kind}, ${domain}, ${version}, ${hash}, ${t.description ?? null},
					 ${t.guidance ?? null}, ${t.producer ?? null}, ${t.default_severity ?? null},
					 ${t.title_template ?? null}, ${t.decider_role ?? null},
					 ${JSON.stringify(t.required_fields ?? [])}::jsonb,
					 ${t.deprecated ?? false}, FALSE)
				ON CONFLICT (type) DO UPDATE SET
					kind = EXCLUDED.kind,
					domain_code = EXCLUDED.domain_code,
					domain_version = EXCLUDED.domain_version,
					content_hash = EXCLUDED.content_hash,
					description = EXCLUDED.description,
					guidance = EXCLUDED.guidance,
					producer = EXCLUDED.producer,
					default_severity = EXCLUDED.default_severity,
					title_template = EXCLUDED.title_template,
					decider_role = EXCLUDED.decider_role,
					required_fields = EXCLUDED.required_fields,
					deprecated = EXCLUDED.deprecated,
					missing_from_bundle = FALSE,
					loaded_at = NOW()
			`;
		}
	}

	// Types no longer in the loaded bundle: flag, never delete.
	const res = present.length
		? await db`
				UPDATE finding_type_def SET missing_from_bundle = TRUE
				WHERE domain_code = ${domain} AND NOT (type = ANY(${present})) AND NOT missing_from_bundle
			`
		: { count: 0 };

	return { direct: direct.length, derived: derived.length, missing: res.count };
}

export async function listTypeDefs(): Promise<FindingTypeDef[]> {
	return db<FindingTypeDef[]>`
		SELECT type, kind, domain_code, domain_version, description, guidance, producer,
		       default_severity, title_template, decider_role, required_fields,
		       deprecated, missing_from_bundle
		FROM finding_type_def
		ORDER BY kind, type
	`;
}

/** Direct, offerable types for /findings/new. Empty array = legacy mode. */
export async function activeDirectTypes(): Promise<FindingTypeDef[]> {
	return db<FindingTypeDef[]>`
		SELECT type, kind, domain_code, domain_version, description, guidance, producer,
		       default_severity, title_template, decider_role, required_fields,
		       deprecated, missing_from_bundle
		FROM finding_type_def
		WHERE kind = 'direct' AND NOT deprecated AND NOT missing_from_bundle
		ORDER BY type
	`;
}

/** One type's def (any kind), or null. */
export async function getTypeDef(type: string): Promise<FindingTypeDef | null> {
	const rows = await db<FindingTypeDef[]>`
		SELECT type, kind, domain_code, domain_version, description, guidance, producer,
		       default_severity, title_template, decider_role, required_fields,
		       deprecated, missing_from_bundle
		FROM finding_type_def WHERE type = ${type} LIMIT 1
	`;
	return rows[0] ?? null;
}
