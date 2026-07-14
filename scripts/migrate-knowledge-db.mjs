// One-shot data migration: knowledge DB (kn_*) → asset_dev (finding*).
//
// - Idempotent: every insert is ON CONFLICT DO NOTHING; safe to re-run.
// - Orphan report: kn_finding_asset rows whose asset_id does not exist in
//   asset are REPORTED AND SKIPPED (the old schema had no FK to stop them;
//   the new one does). The knowledge DB itself is left untouched — it stays
//   around as the backup until the merge has survived real use.
// - kn_connectors: only the document-store row is imported (the
//   asset-registry connector is obsolete — that's the point of the merge).
//
// Run: node scripts/migrate-knowledge-db.mjs

import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
	}
}

const ASSET_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/asset_dev';
const KN_URL =
	process.env.KNOWLEDGE_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/knowledge';

const kn = postgres(KN_URL, { max: 2 });
const dst = postgres(ASSET_URL, { max: 2 });

let exitCode = 0;
try {
	// --- findings -----------------------------------------------------------
	const findings = await kn`SELECT * FROM kn_findings`;
	let fIns = 0;
	for (const f of findings) {
		const r = await dst`
			INSERT INTO finding (
				id, finding_type, title, severity, status,
				description_doc_id, description_html, description_synced_at,
				attributes, raised_at, raised_by, reviewed_at, reviewed_by,
				closed_at, closed_by, created_at, updated_at, updated_by
			) VALUES (
				${f.id}, ${f.finding_type}, ${f.title}, ${f.severity}, ${f.status},
				${f.description_doc_id}, ${f.description_html}, ${f.description_synced_at},
				${dst.json(f.attributes ?? {})}, ${f.raised_at}, ${f.raised_by},
				${f.reviewed_at}, ${f.reviewed_by}, ${f.closed_at}, ${f.closed_by},
				${f.created_at}, ${f.updated_at}, ${f.updated_by}
			) ON CONFLICT (id) DO NOTHING RETURNING id`;
		fIns += r.length;
	}
	console.log(`findings:          ${findings.length} in knowledge → ${fIns} inserted`);

	// --- finding_asset (with orphan report) ---------------------------------
	const links = await kn`SELECT * FROM kn_finding_asset`;
	const orphans = [];
	let laIns = 0;
	for (const l of links) {
		const assetRows = await dst`SELECT id FROM asset WHERE id = ${l.asset_id}::uuid`.catch(() => []);
		if (assetRows.length === 0) {
			orphans.push(l);
			continue;
		}
		const r = await dst`
			INSERT INTO finding_asset (finding_id, asset_id, linked_at)
			VALUES (${l.finding_id}, ${l.asset_id}::uuid, ${l.linked_at})
			ON CONFLICT DO NOTHING RETURNING finding_id`;
		laIns += r.length;
	}
	console.log(`finding_asset:     ${links.length} in knowledge → ${laIns} inserted, ${orphans.length} orphan(s) skipped`);
	for (const o of orphans) {
		console.log(
			`  ! orphan: finding ${o.finding_id} → asset ${o.asset_id} (tag was '${o.asset_tag}', display '${o.asset_display}') — asset not in register`
		);
	}

	// --- finding_document ----------------------------------------------------
	const docs = await kn`SELECT * FROM kn_finding_document`;
	let fdIns = 0;
	for (const d of docs) {
		const r = await dst`
			INSERT INTO finding_document (finding_id, document_id, document_title, linked_at)
			VALUES (${d.finding_id}, ${d.document_id}, ${d.document_title}, ${d.linked_at})
			ON CONFLICT DO NOTHING RETURNING finding_id`;
		fdIns += r.length;
	}
	console.log(`finding_document:  ${docs.length} in knowledge → ${fdIns} inserted`);

	// --- connector: document-store row only ---------------------------------
	const conns = await kn`SELECT * FROM kn_connectors WHERE name = 'document-store'`;
	let cIns = 0;
	for (const c of conns) {
		const r = await dst`
			INSERT INTO connector (name, label, base_url, path_prefix, auth_type, auth_header, auth_value, enabled)
			VALUES (${c.name}, ${c.label}, ${c.base_url}, ${c.path_prefix || null},
				${c.auth_type}, ${c.auth_header}, ${c.auth_value}, ${c.enabled})
			ON CONFLICT (name) DO NOTHING RETURNING id`;
		cIns += r.length;
	}
	console.log(`connector:         document-store → ${cIns} inserted (0 = already present)`);

	// --- audit_log -----------------------------------------------------------
	const audits = await kn`SELECT * FROM kn_audit_log`;
	const existing = await dst`SELECT count(*)::int AS n FROM audit_log`;
	let aIns = 0;
	if (existing[0].n === 0) {
		for (const a of audits) {
			await dst`
				INSERT INTO audit_log (id, ts, method, path, status, duration_ms, ip, user_agent, body_size)
				VALUES (${a.id}, ${a.ts}, ${a.method}, ${a.path}, ${a.status}, ${a.duration_ms},
					${a.ip}, ${a.user_agent}, ${a.body_size})
				ON CONFLICT (id) DO NOTHING`;
			aIns++;
		}
	}
	console.log(`audit_log:         ${audits.length} in knowledge → ${aIns} inserted`);

	// --- verify --------------------------------------------------------------
	const counts = await dst`
		SELECT (SELECT count(*)::int FROM finding) AS f,
		       (SELECT count(*)::int FROM finding_asset) AS fa,
		       (SELECT count(*)::int FROM finding_document) AS fd,
		       (SELECT count(*)::int FROM audit_log) AS al`;
	console.log(
		`asset_dev now has: ${counts[0].f} findings, ${counts[0].fa} asset links, ${counts[0].fd} document links, ${counts[0].al} audit rows`
	);
} catch (e) {
	console.error('migration failed:', e);
	exitCode = 1;
} finally {
	await kn.end({ timeout: 2 });
	await dst.end({ timeout: 2 });
}
process.exit(exitCode);
