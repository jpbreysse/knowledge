import type { PageServerLoad } from './$types';
import { listAllForTree } from '$lib/server/assets';

export type TreeNode = {
	id: string;
	tag: string;
	name: string;
	classCode: string;
	children: TreeNode[];
};

export const load: PageServerLoad = async () => {
	const rows = await listAllForTree();
	const byId = new Map<string, TreeNode>();
	for (const r of rows) {
		byId.set(r.id, {
			id: r.id,
			tag: r.tag,
			name: r.name,
			classCode: r.classCode,
			children: []
		});
	}
	const roots: TreeNode[] = [];
	for (const r of rows) {
		const node = byId.get(r.id)!;
		if (r.parentId && byId.has(r.parentId)) {
			byId.get(r.parentId)!.children.push(node);
		} else {
			roots.push(node);
		}
	}
	return { roots };
};
