import type { PageServerLoad } from './$types';
import { listAssetClasses } from '$lib/server/asset-classes';

export const load: PageServerLoad = async () => {
	const classes = await listAssetClasses();
	// Compact map for the client — only what's needed to colour nodes.
	const classColors: Record<string, string> = {};
	const structuralCodes: string[] = [];
	for (const c of classes) {
		if (c.color) classColors[c.code] = c.color;
		if (c.family === 'STRUCTURAL') structuralCodes.push(c.code);
	}
	return { classColors, structuralCodes };
};
