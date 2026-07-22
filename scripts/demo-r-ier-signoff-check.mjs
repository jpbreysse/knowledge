// Integration test for R-ier-signoff — the transaction rule that blocks IER
// deliverables from transitioning to v1.0-final without a lender sign-off.
//
// This is the acceptance test for the @arborspace/rule-grammar extraction:
// it exercises the full path bundle → normalizer → asset_rule → matchTrigger
// → evalCondition → RuleViolationError → rule_rejection audit row.
//
// The test loads rules-engine.ts via Vite's SSR module loader so it can call
// evaluateTransactionRules() directly, bypassing the API auth layer. Same
// pattern as demo-p407-check.mjs.
//
// Checks (all must pass for exit 0):
//   (a) R-ier-signoff loaded, enabled, class=IER, spec has field_transition
//       trigger to v1.0-final and field_empty condition on sign_off_lender_ref
//   (b) block: update from v0.9-review → v1.0-final without lender ref throws
//       RuleViolationError with field='sign_off_lender_ref' and rule provenance
//   (c) audit: a rule_rejection row was inserted with this actor + message
//   (d) fix: same update WITH sign_off_lender_ref set → no throw
//   (e) no-trigger: leaving version_status at v0.9-review → no throw
//   (f) create path (oldAttributes=null) into v1.0-final without ref → throws

import { createServer } from 'vite';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
	}
}

const green = (s) => `\x1b[32m✓\x1b[0m ${s}`;
const red = (s) => `\x1b[31m✗\x1b[0m ${s}`;
let failed = false;
const ok = (cond, label) => {
	if (cond) console.log(green(label));
	else {
		console.log(red(label));
		failed = true;
	}
	return cond;
};

const ACTOR = `test-r-ier-signoff-${Date.now()}`;

const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
try {
	const { sqlClient } = await vite.ssrLoadModule('/src/lib/server/db/index.ts');
	const { evaluateTransactionRules, RuleViolationError, RuleConfigError } =
		await vite.ssrLoadModule('/src/lib/server/rules-engine.ts');

	// (a) rule loaded + shape check
	const rules = await sqlClient`
		SELECT enabled, class_code, spec
		FROM asset_rule
		WHERE rule_id = 'R-ier-signoff' AND enabled
	`;
	const shapeOk =
		rules.length === 1 &&
		rules[0].class_code === 'IER' &&
		rules[0].spec?.trigger?.kind === 'field_transition' &&
		rules[0].spec?.trigger?.field === 'version_status' &&
		rules[0].spec?.trigger?.to === 'v1.0-final' &&
		Array.isArray(rules[0].spec?.conditions) &&
		rules[0].spec.conditions.some(
			(c) => c.kind === 'field_empty' && c.field === 'sign_off_lender_ref'
		);
	ok(
		shapeOk,
		`(a) R-ier-signoff loaded (enabled=${rules[0]?.enabled}, class=${rules[0]?.class_code}, ` +
			`trigger→v1.0-final, condition sign_off_lender_ref is empty)`
	);
	if (!shapeOk) {
		console.error('   Run: npm run demo:load or POST /api/domain/load to seed rules');
		process.exit(1);
	}

	// (b) block path — update transitions into v1.0-final without lender ref
	const blockCtx = {
		action: 'update',
		actor: ACTOR,
		classCode: 'IER',
		assetId: null,
		tag: 'TEST-IER-block',
		newAttributes: { version_status: 'v1.0-final', sign_off_lender_ref: null },
		oldAttributes: { version_status: 'v0.9-review' }
	};
	let caught = null;
	try {
		await evaluateTransactionRules(blockCtx);
	} catch (e) {
		caught = e;
	}
	const blockedRight =
		caught instanceof RuleViolationError &&
		caught.ruleId === 'R-ier-signoff' &&
		caught.field === 'sign_off_lender_ref' &&
		caught.message.includes('lender sign-off');
	ok(
		blockedRight,
		`(b) block: RuleViolationError thrown (rule=${caught?.ruleId}, field=${caught?.field}, ` +
			`domain=${caught?.domainCode} v${caught?.domainVersion})`
	);

	// (c) audit row inserted with matching actor/tag/rule
	const audit = await sqlClient`
		SELECT rule_id, class_code, message, asset_tag
		FROM rule_rejection
		WHERE actor = ${ACTOR}
	`;
	const auditOk =
		audit.length === 1 &&
		audit[0].rule_id === 'R-ier-signoff' &&
		audit[0].class_code === 'IER' &&
		audit[0].asset_tag === 'TEST-IER-block' &&
		audit[0].message.includes('lender sign-off');
	ok(auditOk, `(c) rule_rejection audit row inserted (${audit.length} row(s) for actor)`);

	// (d) fix path — same transition but with lender ref set → no throw
	let fixCaught = null;
	try {
		await evaluateTransactionRules({
			...blockCtx,
			actor: `${ACTOR}-fix`,
			newAttributes: {
				version_status: 'v1.0-final',
				sign_off_lender_ref: 'https://docs.example/signoff-42'
			}
		});
	} catch (e) {
		fixCaught = e;
	}
	ok(
		fixCaught === null,
		`(d) fix: setting sign_off_lender_ref allows the transition (no throw)`
	);

	// (e) no-trigger — version_status stays at v0.9-review
	let noTrigCaught = null;
	try {
		await evaluateTransactionRules({
			...blockCtx,
			actor: `${ACTOR}-notrig`,
			newAttributes: { version_status: 'v0.9-review', sign_off_lender_ref: null },
			oldAttributes: { version_status: 'v0.9-review' }
		});
	} catch (e) {
		noTrigCaught = e;
	}
	ok(
		noTrigCaught === null,
		`(e) no-trigger: transition that doesn't cross to v1.0-final is a no-op`
	);

	// (f) create path — oldAttributes=null, first-write already at v1.0-final
	// without lender ref should also block (trigger fires when old !== to).
	let createCaught = null;
	try {
		await evaluateTransactionRules({
			action: 'create',
			actor: `${ACTOR}-create`,
			classCode: 'IER',
			assetId: null,
			tag: 'TEST-IER-create',
			newAttributes: { version_status: 'v1.0-final', sign_off_lender_ref: null },
			oldAttributes: null
		});
	} catch (e) {
		createCaught = e;
	}
	ok(
		createCaught instanceof RuleViolationError &&
			createCaught.field === 'sign_off_lender_ref',
		`(f) create: first-write at v1.0-final without lender ref also blocked ` +
			`(rule=${createCaught?.ruleId}, field=${createCaught?.field})`
	);

	// Cleanup — remove the three test audit rows we inserted (block + create).
	// rule_rejection is otherwise append-only; we clean only our own tagged rows.
	const del = await sqlClient`
		DELETE FROM rule_rejection WHERE actor LIKE ${ACTOR + '%'}
	`;
	console.log(`  cleanup: deleted ${del.count} test audit row(s)`);

	// Sanity: unused import RuleConfigError should exist (proves symbol still exported)
	if (typeof RuleConfigError !== 'function') failed = true;

	await sqlClient.end({ timeout: 2 });
} catch (e) {
	console.error(red(`test crashed: ${e?.stack ?? e}`));
	failed = true;
} finally {
	await vite.close();
}
process.exit(failed ? 1 : 0);
