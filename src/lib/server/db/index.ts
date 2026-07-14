import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const url = env.DATABASE_URL ?? env.SCALINGO_POSTGRESQL_URL;
if (!url) {
	throw new Error('DATABASE_URL (or SCALINGO_POSTGRESQL_URL) is not set');
}

// Single pool per Node process — SvelteKit dev reloads the module, so we stash it on globalThis.
const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };
export const sqlClient = globalForDb.__sql ?? postgres(url, { max: 10 });
if (!globalForDb.__sql) globalForDb.__sql = sqlClient;

export const db = drizzle(sqlClient, { schema });
export { schema };
