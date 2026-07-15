// Create (or bootstrap) a user account — accounts are invite-only.
//
//   node scripts/create-user.mjs <email> <name> [role] [--password <pw>]
//
// role: admin | user | viewer (default viewer).
// Prints a generated password unless --password is given.
//
// Builds its own Better Auth instance (same secret + database as the app,
// WITHOUT the SvelteKit cookie plugin) so it runs outside a request context.
// Loads the drizzle schema through Vite so $lib-style TS resolves.

import { createServer } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';

if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
	}
}

const [email, name, roleArg, ...rest] = process.argv.slice(2);
const role = ['admin', 'user', 'viewer'].includes(roleArg) ? roleArg : 'viewer';
const pwFlag = rest.indexOf('--password');
const password =
	pwFlag !== -1 && rest[pwFlag + 1] ? rest[pwFlag + 1] : randomBytes(9).toString('base64url');

if (!email || !name) {
	console.error('usage: node scripts/create-user.mjs <email> <name> [admin|user|viewer] [--password <pw>]');
	process.exit(1);
}

const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'error' });
let exitCode = 0;
try {
	const schema = await vite.ssrLoadModule('/src/lib/server/db/auth-schema.ts');
	const { db, sqlClient } = await vite.ssrLoadModule('/src/lib/server/db/index.ts');

	const auth = betterAuth({
		secret: process.env.BETTER_AUTH_SECRET,
		baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5177',
		database: drizzleAdapter(db, {
			provider: 'pg',
			schema: {
				user: schema.authUser,
				session: schema.authSession,
				account: schema.authAccount,
				verification: schema.authVerification
			}
		}),
		emailAndPassword: { enabled: true },
		plugins: [admin({ defaultRole: 'viewer', adminRoles: ['admin'] })]
	});

	await auth.api.signUpEmail({ body: { email, password, name } });
	if (role !== 'viewer') {
		await sqlClient`UPDATE auth_user SET role = ${role} WHERE email = ${email}`;
	}
	const [row] = await sqlClient`SELECT email, role FROM auth_user WHERE email = ${email}`;
	console.log(`✓ user created: ${row.email} (role: ${row.role ?? 'viewer'})`);
	console.log(`  password: ${password}`);
	console.log(`  → sign in at ${process.env.BETTER_AUTH_URL ?? 'http://localhost:5177'}/login`);
	await sqlClient.end({ timeout: 2 });
} catch (e) {
	const msg = e?.body?.message ?? e?.message ?? String(e);
	console.error('✗ failed:', msg);
	exitCode = 1;
} finally {
	await vite.close();
}
process.exit(exitCode);
