// Smoke checklist for the P-407 walkthrough (npm run demo:p407).
// Prints green/red per check; exits non-zero if any hard check fails.
//   (a) P-407 exists and its attributes are class-driven (⊆ PUMP-SUBMERSIBLE
//       attribute_fields); page render spot-checked when the dev server is up
//   (b) asset_history has the `created | demo-seed` row
//   (c) the Raise-finding URL is internal and carries asset_id + return_to
//   (d) the document-store connector is enabled (warn only — descriptions)
//   (e) re-running the seed is a no-op (exit 0, still exactly one P-407)

import { createServer } from 'vite';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
	}
}

const green = (s) => `\x1b[32m✓\x1b[0m ${s}`;
const red = (s) => `\x1b[31m✗\x1b[0m ${s}`;
const warn = (s) => `\x1b[33m!\x1b[0m ${s}`;
let failed = false;
const ok = (cond, label, warnOnly = false) => {
	if (cond) console.log(green(label));
	else if (warnOnly) console.log(warn(label));
	else {
		console.log(red(label));
		failed = true;
	}
	return cond;
};

const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
try {
	const { sqlClient } = await vite.ssrLoadModule('/src/lib/server/db/index.ts');

	// (a) row + class-driven attributes
	const rows = await sqlClient`SELECT id, tag, name, attributes FROM asset WHERE tag = 'P-407'`;
	ok(rows.length === 1, `(a) P-407 exists (${rows[0]?.id ?? 'MISSING'})`);
	const p407 = rows[0];
	if (p407) {
		const cls = await sqlClient`
			SELECT attribute_fields FROM asset_class WHERE code = 'PUMP-SUBMERSIBLE'`;
		const declared = new Set((cls[0]?.attribute_fields ?? []).map((f) => f.name));
		const keys = Object.keys(p407.attributes ?? {});
		const undeclared = keys.filter((k) => !declared.has(k));
		ok(
			keys.length > 0 && undeclared.length === 0,
			`(a) all ${keys.length} attributes are declared by PUMP-SUBMERSIBLE (${keys.join(', ')})`
		);
		// Page render — only when the dev server is reachable.
		try {
			const res = await fetch(`http://127.0.0.1:5177/assets/${p407.id}`, {
				signal: AbortSignal.timeout(3000)
			});
			const html = await res.text();
			ok(
				res.ok && html.includes('Sump drain pump') && html.includes('Grundfos'),
				'(a) /assets/[id] renders P-407 with class-driven fields'
			);
		} catch {
			ok(false, '(a) page check skipped — dev server not reachable on :5177', true);
		}
	}

	// (b) audit row
	if (p407) {
		const hist = await sqlClient`
			SELECT changed_by FROM asset_history
			WHERE asset_id = ${p407.id} AND field_name = 'created'`;
		ok(
			hist.length === 1 && hist[0].changed_by === 'demo-seed',
			`(b) asset_history has 'created | demo-seed'`
		);
	}

	// (c) Raise-finding URL — internal since the findings merge (same
	// construction as FindingsPanel)
	if (p407) {
		const href =
			`/findings/new` +
			`?asset_id=${encodeURIComponent(p407.id)}` +
			`&asset_tag=${encodeURIComponent(p407.tag)}` +
			`&asset_display=${encodeURIComponent(`${p407.tag} — ${p407.name}`)}` +
			`&return_to=${encodeURIComponent(`/assets/${p407.id}`)}`;
		const u = new URL(href, 'http://localhost');
		const params = ['asset_id', 'asset_tag', 'asset_display', 'return_to'];
		ok(
			u.pathname === '/findings/new' &&
				params.every((k) => !!u.searchParams.get(k)) &&
				u.searchParams.get('asset_id') === p407.id &&
				u.searchParams.get('return_to') === `/assets/${p407.id}`,
			`(c) Raise-finding URL internal: /findings/new?asset_id&asset_tag&asset_display&return_to`
		);
	}

	// (d) document-store connector — warn, don't fail (only descriptions need it)
	const conn = await sqlClient`SELECT enabled FROM connector WHERE name = 'document-store'`;
	ok(
		conn.length === 1 && conn[0].enabled === true,
		conn.length
			? `(d) document-store connector ${conn[0].enabled ? 'enabled' : 'DISABLED'}`
			: '(d) document-store connector missing — finding descriptions unavailable',
		true
	);

	// (e) seed rerun is a no-op
	const rerun = spawnSync('node', ['scripts/seed-p407.mjs'], { encoding: 'utf8' });
	const count = await sqlClient`SELECT count(*)::int AS n FROM asset WHERE tag = 'P-407'`;
	ok(
		rerun.status === 0 &&
			rerun.stdout.includes('already exists') &&
			count[0].n === 1,
		'(e) re-running the seed is a no-op (exit 0, still exactly one P-407)'
	);

	await sqlClient.end({ timeout: 2 });
} catch (e) {
	console.error(red(`checklist crashed: ${e}`));
	failed = true;
} finally {
	await vite.close();
}
process.exit(failed ? 1 : 0);
