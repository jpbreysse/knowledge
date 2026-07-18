// Minimal client for the ontology app (docs: transaction-rule engine).
// Deliberately NOT the connector fabric — one env var, one module, same
// fetch/timeout conventions as the connector search proxy.

import { env } from '$env/dynamic/private';

// The ontology dev server binds IPv6 localhost — use the hostname, not 127.0.0.1.
export const ONTOLOGY_URL = (env.ONTOLOGY_URL ?? 'http://localhost:5185').replace(/\/+$/, '');

export type PublishedVersion = {
	version: number;
	hash: string;
	published_at: string;
	published_by: string | null;
};

export type BundleRule = {
	id: string;
	name?: string;
	version?: number;
	severity?: string;
	enforcement?: string;
	description?: string;
	definition?: {
		trigger?: {
			event?: string;
			field?: string;
			to?: string;
			entity?: string;
			condition?: string;
		};
		query?: { plain?: string; predicates?: string[] };
		action?: { kind?: string; message?: string; plain?: string };
	};
};

export type Bundle = {
	domain?: string;
	code?: string;
	version?: number;
	hash?: string;
	content_hash?: string;
	rules?: BundleRule[];
};

async function get(path: string): Promise<Response> {
	return fetch(`${ONTOLOGY_URL}${path}`, {
		signal: AbortSignal.timeout(5000),
		headers: { accept: 'application/json' }
	});
}

export async function fetchVersions(domainCode: string): Promise<PublishedVersion[]> {
	const res = await get(`/api/domains/${encodeURIComponent(domainCode)}/versions`);
	if (!res.ok) throw new Error(`ontology app returned ${res.status} for versions`);
	const body = (await res.json()) as { ok?: boolean; versions?: PublishedVersion[] };
	return body.versions ?? [];
}

export async function fetchBundle(domainCode: string, version: number | 'latest'): Promise<Bundle> {
	const res = await get(
		`/api/domains/${encodeURIComponent(domainCode)}/versions/${version}/bundle`
	);
	if (!res.ok) throw new Error(`ontology app returned ${res.status} for bundle ${domainCode}/${version}`);
	return (await res.json()) as Bundle;
}

/** Fire-and-forget consumer heartbeat — never blocks or fails a load. */
export async function postHeartbeat(domain: string, version: number, hash: string): Promise<void> {
	try {
		const res = await fetch(`${ONTOLOGY_URL}/api/consumers/heartbeat`, {
			method: 'POST',
			signal: AbortSignal.timeout(5000),
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ consumer: 'asset-app', domain, version, hash })
		});
		if (!res.ok) console.error(`[ontology] heartbeat rejected: ${res.status}`);
	} catch (e) {
		console.error('[ontology] heartbeat failed:', (e as Error).message);
	}
}
