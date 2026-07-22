import type { PageServerLoad } from './$types';
import { sqlClient as db } from '$lib/server/db';

export type PendingProposal = {
	id: string;
	title: string;
	severity: string;
	finding_type: string;
	rule_id: string;
	rule_version: number;
	domain_version: number;
	trigger_summary: string | null;
	raised_at: Date;
	decider_role: string | null;
	asset_id: string | null;
	asset_tag: string | null;
	asset_name: string | null;
};

export const load: PageServerLoad = async () => {
	const proposals = await db<PendingProposal[]>`
		SELECT f.id, f.title, f.severity, f.finding_type,
		       f.rule_id, f.rule_version, f.domain_version, f.trigger_summary, f.raised_at,
		       ftd.decider_role,
		       a.id::text AS asset_id, a.tag AS asset_tag, a.name AS asset_name
		FROM finding f
		LEFT JOIN finding_type_def ftd ON ftd.type = f.finding_type
		LEFT JOIN finding_asset fa ON fa.finding_id = f.id
		LEFT JOIN asset a ON a.id = fa.asset_id
		WHERE f.review_status = 'pending'
		ORDER BY f.raised_at DESC
	`;
	return { proposals };
};
