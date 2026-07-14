// Outbound HTTP client for federated apps (today: the document store).
// Reads the `connector` table (name/base_url/path_prefix/auth_*) and issues
// authenticated fetches with a timeout. Ported from the findings app's
// server/connector.ts — the registry moved from kn_connectors to `connector`
// (migration 015 added the auth columns).
//
// Not to be confused with connectors.ts (drizzle CRUD for the admin UI).

import { sqlClient } from './db';

export interface ConnectorConfig {
	name: string;
	label: string;
	base_url: string;
	auth_type: string;
	auth_header: string | null;
	auth_value: string | null;
	path_prefix: string;
	enabled: boolean;
}

export async function getConnectorConfig(name: string): Promise<ConnectorConfig | null> {
	const rows = await sqlClient<ConnectorConfig[]>`
		SELECT name, label, base_url, auth_type, auth_header, auth_value,
			COALESCE(path_prefix, '') AS path_prefix, enabled
		FROM connector
		WHERE name = ${name} AND enabled = TRUE
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export class ConnectorError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'ConnectorError';
	}
}

interface CallOptions {
	method?: string;
	body?: unknown;
	query?: Record<string, string | number | undefined>;
	timeoutMs?: number;
}

export async function callConnector(
	name: string,
	path: string,
	options: CallOptions = {}
): Promise<Response> {
	const connector = await getConnectorConfig(name);
	if (!connector) {
		throw new ConnectorError(`Connector '${name}' not found or disabled`);
	}

	const url = new URL(`${connector.base_url}${connector.path_prefix}${path}`);
	if (options.query) {
		for (const [k, v] of Object.entries(options.query)) {
			if (v !== undefined && v !== null && v !== '') {
				url.searchParams.set(k, String(v));
			}
		}
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json'
	};

	if (connector.auth_type === 'api_key' && connector.auth_header && connector.auth_value) {
		headers[connector.auth_header] = connector.auth_value;
	} else if (connector.auth_type === 'bearer' && connector.auth_value) {
		headers['Authorization'] = `Bearer ${connector.auth_value}`;
	} else if (connector.auth_type === 'basic' && connector.auth_value) {
		headers['Authorization'] = `Basic ${connector.auth_value}`;
	}

	const ac = new AbortController();
	const timeout = setTimeout(() => ac.abort(), options.timeoutMs ?? 5000);

	try {
		return await fetch(url.toString(), {
			method: options.method ?? 'GET',
			headers,
			body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
			signal: ac.signal
		});
	} catch (e) {
		if ((e as Error).name === 'AbortError') {
			throw new ConnectorError(`Connector '${name}' timed out`, e);
		}
		throw new ConnectorError(`Connector '${name}' fetch failed: ${(e as Error).message}`, e);
	} finally {
		clearTimeout(timeout);
	}
}
