import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAssetsForGraph } from '$lib/server/assets';
import { listAllEntityLinks } from '$lib/server/entity-links';

export const GET: RequestHandler = async () => {
	const [rows, links] = await Promise.all([listAssetsForGraph(), listAllEntityLinks()]);

	const nodes = rows.map((r) => ({
		data: {
			id: r.id,
			tag: r.tag,
			name: r.name,
			class: r.classCode,
			criticality: r.criticality,
			lifecycle: r.lifecycleState,
			condition: r.latestCondition,
			assessment_status: r.latestAssessmentStatus
		}
	}));

	const containsEdges = rows
		.filter((r) => r.parentId)
		.map((r) => ({
			data: {
				id: `contains-${r.parentId}-${r.id}`,
				source: r.parentId!,
				target: r.id,
				rel_type: 'contains'
			}
		}));

	// Typed cross-links (v3.1). Deterministic edge id = entity_link.id.
	const typedEdges = links.map((l) => ({
		data: {
			id: l.id,
			source: l.sourceId,
			target: l.targetId,
			rel_type: l.relationType
		}
	}));

	return json({ nodes, edges: [...containsEdges, ...typedEdges] });
};
