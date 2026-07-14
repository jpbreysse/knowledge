// Seed the P-407 demo pump THROUGH the write service (createAsset) — not raw
// SQL — so it exercises the same validation + audit path as every runtime
// write. Doubles as the write-service integration test: the creation must
// land in asset_history as `created | demo-seed`.
//
// asset-service.ts lives behind SvelteKit's $lib / $env aliases, so this
// runner loads it via Vite's SSR module loader (no new dependencies; the
// sveltekit plugin in vite.config.ts resolves the aliases and virtual
// $env modules exactly as in `npm run dev`).
//
// Idempotent: if P-407 already exists, reports and exits 0.
//
// Run: npm run demo:p407:seed

import { createServer } from 'vite';
import { readFileSync, existsSync } from 'node:fs';

// $env/dynamic/private reads process.env — preload .env the way dev does.
if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
	}
}

const P407 = {
	tag: 'P-407',
	name: 'Sump drain pump',
	class_code: 'PUMP-SUBMERSIBLE',
	attributes: {
		manufacturer: 'Grundfos',
		model: 'SL1-80',
		lifecycle_state: 'operating',
		criticality: 3,
		commissioning_date: '2020-05-01',
		location: 'Sump pit 4'
	}
};
const ACTOR = 'demo-seed';

const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
let exitCode = 0;
try {
	const { sqlClient } = await vite.ssrLoadModule('/src/lib/server/db/index.ts');

	const existing = await sqlClient`SELECT id FROM asset WHERE tag = ${P407.tag}`;
	if (existing.length > 0) {
		console.log(`✓ ${P407.tag} already exists (${existing[0].id}) — nothing to do.`);
	} else {
		const { createAsset } = await vite.ssrLoadModule('/src/lib/server/asset-service.ts');
		const result = await createAsset(P407, ACTOR);
		if (!result.ok) {
			console.error(`✗ createAsset refused ${P407.tag}:`, JSON.stringify(result.errors));
			exitCode = 1;
		} else {
			const hist = await sqlClient`
				SELECT field_name, changed_by FROM asset_history
				WHERE asset_id = ${result.row.id} AND field_name = 'created'`;
			const audited = hist.length === 1 && hist[0].changed_by === ACTOR;
			console.log(`✓ created ${result.row.tag} (${result.row.id}) via asset-service`);
			console.log(
				audited
					? `✓ audit: asset_history has 'created | ${ACTOR}'`
					: `✗ audit row missing or wrong actor: ${JSON.stringify(hist)}`
			);
			if (!audited) exitCode = 1;
		}
	}

	if (exitCode === 0) {
		console.log(`
Walkthrough (see docs/demo-p407.md):
  1. npm run dev  →  open /assets and search P-407
  2. On the P-407 page, Findings section → "Raise finding" (same tab, asset pre-linked)
  3. Type a title, save — you're back on P-407 with the finding in the list. One loop.`);
	}

	await sqlClient.end({ timeout: 2 });
} catch (e) {
	console.error('✗ seed failed:', e);
	exitCode = 1;
} finally {
	await vite.close();
}
process.exit(exitCode);
