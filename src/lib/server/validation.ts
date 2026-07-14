import { CLASS_CODES, isPumpClass } from '$lib/constants';
import type { AssetClass, AssetClassField } from './db/schema';

// v3.1: the 7 equipment-flavoured fields moved to `attributes` JSONB in
// migration 013. AssetInput / Validated only carry the fields still on the
// asset row itself.
export type AssetInput = {
	tag: string;
	name: string;
	class_code: string;
	attributes?: Record<string, unknown>;
	content?: Record<string, unknown> | null;
	parent_id?: string | null;
	confidentiality?: string | null;
	version?: string | null;
	supersedes_asset_id?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUMP_ATTR_KEYS = [
	'rated_flow_m3h',
	'rated_head_m',
	'rated_power_kw',
	'suction_pressure_bar',
	'discharge_pressure_bar',
	'fluid',
	'speed_rpm',
	'npsh_required_m'
] as const;

/**
 * Validate an attributes JSONB value against a class's declared field schema.
 * Mutates the passed-in `attributes` map for numeric coercion (turning string
 * "10" into number 10) so downstream INSERT writes the right type.
 *
 * Pure pre-schema fallback: when `fields` is empty, no per-field validation
 * runs — the original PUMP_ATTR_KEYS coercion fires elsewhere as before.
 */
function validateAttributesAgainstFields(
	attributes: Record<string, unknown>,
	fields: AssetClassField[],
	errors: Record<string, string>
) {
	for (const f of fields) {
		const raw = attributes[f.name];
		const isEmpty = raw === undefined || raw === null || raw === '';

		if (isEmpty) {
			if (f.required) errors[`attributes.${f.name}`] = 'required';
			delete attributes[f.name];
			continue;
		}

		switch (f.type) {
			case 'number': {
				const n = typeof raw === 'number' ? raw : Number(raw);
				if (!Number.isFinite(n)) errors[`attributes.${f.name}`] = 'must be number';
				else attributes[f.name] = n;
				break;
			}
			case 'boolean': {
				if (typeof raw === 'boolean') attributes[f.name] = raw;
				else if (raw === 'true' || raw === '1' || raw === 1) attributes[f.name] = true;
				else if (raw === 'false' || raw === '0' || raw === 0) attributes[f.name] = false;
				else errors[`attributes.${f.name}`] = 'must be boolean';
				break;
			}
			case 'date': {
				if (typeof raw !== 'string' || !ISO_DATE_RE.test(raw))
					errors[`attributes.${f.name}`] = 'must be YYYY-MM-DD';
				break;
			}
			case 'select': {
				if (typeof raw !== 'string') {
					errors[`attributes.${f.name}`] = 'must be string';
					break;
				}
				if (f.options && f.options.length > 0 && !f.options.includes(raw))
					errors[`attributes.${f.name}`] = `must be one of ${f.options.join(', ')}`;
				break;
			}
			case 'list': {
				if (!Array.isArray(raw)) errors[`attributes.${f.name}`] = 'must be an array';
				break;
			}
			case 'object': {
				if (typeof raw !== 'object' || Array.isArray(raw))
					errors[`attributes.${f.name}`] = 'must be a JSON object';
				break;
			}
			case 'ref': {
				if (typeof raw !== 'string' || !UUID_RE.test(raw))
					errors[`attributes.${f.name}`] = 'must be a UUID';
				break;
			}
			case 'array_ref': {
				if (!Array.isArray(raw)) {
					errors[`attributes.${f.name}`] = 'must be an array of UUIDs';
					break;
				}
				const bad = raw.findIndex((v) => typeof v !== 'string' || !UUID_RE.test(v));
				if (bad >= 0) errors[`attributes.${f.name}.${bad}`] = 'must be a UUID';
				break;
			}
			case 'text':
			default: {
				if (typeof raw !== 'string') attributes[f.name] = String(raw);
				break;
			}
		}
	}
}

export type Validated = {
	ok: true;
	value: {
		tag: string;
		name: string;
		classCode: string;
		attributes: Record<string, unknown>;
		content: Record<string, unknown> | null;
		parentId: string | null;
		confidentiality: string | null;
		version: string | null;
		supersedesAssetId: string | null;
	};
};

const CONFIDENTIALITY_VALUES = ['public', 'client-shareable', 'internal', 'restricted'] as const;

export type InvalidResult = { ok: false; errors: Record<string, string> };

function str(v: unknown): string | null {
	if (v === null || v === undefined || v === '') return null;
	if (typeof v !== 'string') return null;
	return v.trim() || null;
}

export function validateAsset(
	input: unknown,
	classDef?: AssetClass | null
): Validated | InvalidResult {
	const errors: Record<string, string> = {};
	if (!input || typeof input !== 'object') {
		return { ok: false, errors: { _root: 'body must be an object' } };
	}
	const b = input as AssetInput;

	const tag = str(b.tag);
	if (!tag) errors.tag = 'required';
	else if (tag.length > 64) errors.tag = 'max 64 chars';

	const name = str(b.name);
	if (!name) errors.name = 'required';
	else if (name.length > 256) errors.name = 'max 256 chars';

	const classCode = str(b.class_code);
	if (!classCode) errors.class_code = 'required';
	// Enum validation has moved to the API layer (it does an async lookup in
	// asset_class) so the taxonomy is authoritative. We keep a soft fallback
	// here ONLY when the caller didn't pass a classDef AND the code isn't in
	// the legacy hardcoded list — that catches truly garbled inputs.
	else if (
		!classDef &&
		!CLASS_CODES.includes(classCode as (typeof CLASS_CODES)[number])
	) {
		errors.class_code = 'unknown class — define it in /asset-types first';
	}

	const parentId = str(b.parent_id);
	if (parentId && !UUID_RE.test(parentId)) errors.parent_id = 'must be UUID';

	const confidentiality = str(b.confidentiality);
	if (confidentiality && !CONFIDENTIALITY_VALUES.includes(confidentiality as 'public'))
		errors.confidentiality = `must be one of ${CONFIDENTIALITY_VALUES.join(', ')}`;

	const version = str(b.version);
	if (version && version.length > 50) errors.version = 'max 50 chars';

	const supersedesAssetId = str(b.supersedes_asset_id);
	if (supersedesAssetId && !UUID_RE.test(supersedesAssetId))
		errors.supersedes_asset_id = 'must be UUID';

	let attributes: Record<string, unknown> = {};
	if (b.attributes !== undefined && b.attributes !== null) {
		if (typeof b.attributes !== 'object' || Array.isArray(b.attributes)) {
			errors.attributes = 'must be object';
		} else {
			attributes = { ...b.attributes };

			// Preferred path (v2.4+): validate against the class's attribute schema.
			if (classDef && classDef.attributeFields?.length > 0) {
				validateAttributesAgainstFields(attributes, classDef.attributeFields, errors);
			}
			// Backwards-compat: if no class def is available (e.g. taxonomy table
			// empty, or class not yet defined), retain the legacy pump coercion so
			// the existing PUMP-* seed data and forms still validate correctly.
			else if (classCode && isPumpClass(classCode)) {
				for (const k of PUMP_ATTR_KEYS) {
					if (k in attributes && attributes[k] !== null && attributes[k] !== undefined && attributes[k] !== '') {
						if (k === 'fluid') {
							if (typeof attributes[k] !== 'string') errors[`attributes.${k}`] = 'must be string';
						} else {
							const n = Number(attributes[k]);
							if (!Number.isFinite(n)) errors[`attributes.${k}`] = 'must be number';
							else attributes[k] = n;
						}
					}
				}
			}
		}
	}

	let content: Record<string, unknown> | null = null;
	if (b.content !== undefined && b.content !== null) {
		if (typeof b.content !== 'object' || Array.isArray(b.content)) errors.content = 'must be JSON object';
		else content = b.content as Record<string, unknown>;
	}

	if (Object.keys(errors).length > 0) return { ok: false, errors };

	return {
		ok: true,
		value: {
			tag: tag!,
			name: name!,
			classCode: classCode!,
			attributes,
			content,
			parentId,
			confidentiality,
			version,
			supersedesAssetId
		}
	};
}

export function isUuid(s: string | null | undefined): s is string {
	return !!s && UUID_RE.test(s);
}

// ---------- Asset class (taxonomy) ----------

const CLASS_CODE_RE = /^[A-Z][A-Z0-9-]{1,49}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ASSET_CLASS_FAMILIES = [
	'EQUIPMENT',
	'STRUCTURAL',
	'RELATIONSHIP',
	'OTHER',
	'LAYER-1',
	'LAYER-2',
	'LAYER-3',
	'PROJECT',
	'PARTY',
	'ASSET'
] as const;
const ASSET_CLASS_FIELD_TYPES = [
	'text',
	'number',
	'date',
	'select',
	'boolean',
	'list',
	'object',
	'ref',
	'array_ref'
] as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type AssetClassFieldInput = {
	name?: string;
	label?: string;
	type?: string;
	required?: boolean;
	group?: string | null;
	unit?: string | null;
	options?: string[];
	asset_class_filter?: string | string[] | null;
};

export type AssetClassInput = {
	code?: string;
	label?: string;
	family?: string;
	description?: string | null;
	color?: string | null;
	attribute_fields?: AssetClassFieldInput[];
	valid_lifecycle_states?: string[];
	applicable_tabs?: string[];
	enabled?: boolean;
};

type ValidatedField = {
	name: string;
	label: string;
	type: (typeof ASSET_CLASS_FIELD_TYPES)[number];
	required?: boolean;
	group?: string;
	unit?: string;
	options?: string[];
	asset_class_filter?: string | string[];
};

export type AssetClassValidated = {
	ok: true;
	value: {
		code: string;
		label: string;
		family: (typeof ASSET_CLASS_FAMILIES)[number];
		description: string | null;
		color: string | null;
		attributeFields: ValidatedField[];
		validLifecycleStates: string[];
		applicableTabs: string[];
		enabled: boolean;
	};
};

function validateFields(input: unknown, errors: Record<string, string>): ValidatedField[] {
	if (input === undefined || input === null) return [];
	if (!Array.isArray(input)) {
		errors.attribute_fields = 'must be an array';
		return [];
	}
	const out: ValidatedField[] = [];
	const seen = new Set<string>();
	input.forEach((raw, i) => {
		if (!raw || typeof raw !== 'object') {
			errors[`attribute_fields.${i}`] = 'must be an object';
			return;
		}
		const f = raw as AssetClassFieldInput;
		const name = str(f.name);
		const label = str(f.label);
		const type = str(f.type);
		if (!name) errors[`attribute_fields.${i}.name`] = 'required';
		else if (!/^[a-z][a-z0-9_]{0,49}$/.test(name))
			errors[`attribute_fields.${i}.name`] = 'lowercase a–z 0–9 _, ≤50';
		else if (seen.has(name)) errors[`attribute_fields.${i}.name`] = 'duplicate field name';
		else seen.add(name);

		if (!label) errors[`attribute_fields.${i}.label`] = 'required';
		if (!type || !ASSET_CLASS_FIELD_TYPES.includes(type as ValidatedField['type']))
			errors[`attribute_fields.${i}.type`] = `must be one of ${ASSET_CLASS_FIELD_TYPES.join(', ')}`;

		if (name && label && type && ASSET_CLASS_FIELD_TYPES.includes(type as ValidatedField['type'])) {
			const field: ValidatedField = {
				name,
				label,
				type: type as ValidatedField['type']
			};
			if (f.required) field.required = true;
			const group = str(f.group);
			if (group) field.group = group;
			const unit = str(f.unit);
			if (unit) field.unit = unit;
			if (Array.isArray(f.options)) {
				const opts = f.options.map((o) => str(o)).filter((o): o is string => !!o);
				if (opts.length > 0) field.options = opts;
			}
			// asset_class_filter — only meaningful for ref / array_ref
			if (field.type === 'ref' || field.type === 'array_ref') {
				const rawFilter = f.asset_class_filter;
				if (Array.isArray(rawFilter)) {
					const codes = rawFilter.map((c) => str(c)).filter((c): c is string => !!c);
					if (codes.length === 1) field.asset_class_filter = codes[0];
					else if (codes.length > 1) field.asset_class_filter = codes;
				} else if (typeof rawFilter === 'string') {
					const single = str(rawFilter);
					if (single) field.asset_class_filter = single;
				}
			}
			out.push(field);
		}
	});
	return out;
}

function validateStringArray(input: unknown, key: string, errors: Record<string, string>): string[] {
	if (input === undefined || input === null) return [];
	if (!Array.isArray(input)) {
		errors[key] = 'must be an array of strings';
		return [];
	}
	return input.map((v) => str(v)).filter((v): v is string => !!v);
}

export function validateAssetClass(input: unknown): AssetClassValidated | InvalidResult {
	const errors: Record<string, string> = {};
	if (!input || typeof input !== 'object')
		return { ok: false, errors: { _root: 'body must be an object' } };
	const b = input as AssetClassInput;

	const code = str(b.code);
	if (!code) errors.code = 'required';
	else if (!CLASS_CODE_RE.test(code)) errors.code = 'UPPER-SNAKE-CASE, A–Z 0–9 hyphen, 2–50 chars';

	const label = str(b.label);
	if (!label) errors.label = 'required';
	else if (label.length > 100) errors.label = 'max 100 chars';

	const family = str(b.family);
	if (!family) errors.family = 'required';
	else if (!ASSET_CLASS_FAMILIES.includes(family as (typeof ASSET_CLASS_FAMILIES)[number]))
		errors.family = `must be one of ${ASSET_CLASS_FAMILIES.join(', ')}`;

	const description = str(b.description);
	const color = str(b.color);
	if (color && !COLOR_RE.test(color)) errors.color = 'must be #RRGGBB';

	const attributeFields = validateFields(b.attribute_fields, errors);
	const validLifecycleStates = validateStringArray(
		b.valid_lifecycle_states,
		'valid_lifecycle_states',
		errors
	);
	const applicableTabs = validateStringArray(b.applicable_tabs, 'applicable_tabs', errors);
	const enabled = b.enabled === undefined ? true : Boolean(b.enabled);

	if (Object.keys(errors).length > 0) return { ok: false, errors };

	return {
		ok: true,
		value: {
			code: code!,
			label: label!,
			family: family as (typeof ASSET_CLASS_FAMILIES)[number],
			description,
			color,
			attributeFields,
			validLifecycleStates,
			applicableTabs,
			enabled
		}
	};
}

export function validateAssetClassPatch(input: unknown):
	| { ok: true; value: Partial<AssetClassValidated['value']> }
	| InvalidResult {
	const errors: Record<string, string> = {};
	if (!input || typeof input !== 'object')
		return { ok: false, errors: { _root: 'body must be an object' } };
	const b = input as AssetClassInput;
	const out: Partial<AssetClassValidated['value']> = {};

	if (b.code !== undefined) {
		const v = str(b.code);
		if (!v) errors.code = 'required';
		else if (!CLASS_CODE_RE.test(v)) errors.code = 'UPPER-SNAKE-CASE, A–Z 0–9 hyphen, 2–50 chars';
		else out.code = v;
	}
	if (b.label !== undefined) {
		const v = str(b.label);
		if (!v) errors.label = 'required';
		else if (v.length > 100) errors.label = 'max 100 chars';
		else out.label = v;
	}
	if (b.family !== undefined) {
		const v = str(b.family);
		if (!v || !ASSET_CLASS_FAMILIES.includes(v as (typeof ASSET_CLASS_FAMILIES)[number]))
			errors.family = `must be one of ${ASSET_CLASS_FAMILIES.join(', ')}`;
		else out.family = v as (typeof ASSET_CLASS_FAMILIES)[number];
	}
	if (b.description !== undefined) out.description = str(b.description);
	if (b.color !== undefined) {
		const v = str(b.color);
		if (v === null) out.color = null;
		else if (!COLOR_RE.test(v)) errors.color = 'must be #RRGGBB';
		else out.color = v;
	}
	if (b.attribute_fields !== undefined)
		out.attributeFields = validateFields(b.attribute_fields, errors);
	if (b.valid_lifecycle_states !== undefined)
		out.validLifecycleStates = validateStringArray(
			b.valid_lifecycle_states,
			'valid_lifecycle_states',
			errors
		);
	if (b.applicable_tabs !== undefined)
		out.applicableTabs = validateStringArray(b.applicable_tabs, 'applicable_tabs', errors);
	if (b.enabled !== undefined) out.enabled = Boolean(b.enabled);

	if (Object.keys(errors).length > 0) return { ok: false, errors };
	return { ok: true, value: out };
}

export {
	ASSET_CLASS_FAMILIES,
	ASSET_CLASS_FIELD_TYPES
};

// ---------- Connector ----------

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i;

export type ConnectorInput = {
	name?: string;
	label?: string;
	base_url?: string;
	path_prefix?: string | null;
	auth_type?: string;
	enabled?: boolean;
	link_template?: string;
};

export type ConnectorValidated = {
	ok: true;
	value: {
		name: string;
		label: string;
		baseUrl: string;
		pathPrefix: string | null;
		authType: 'none';
		enabled: boolean;
		linkTemplate: string;
	};
};

const DEFAULT_LINK_TEMPLATE = '{base_url}/documents/{id}';

const CONNECTOR_AUTH_TYPES = ['none'] as const;

/** Full validation for POST /api/connectors. */
export function validateConnector(input: unknown): ConnectorValidated | InvalidResult {
	const errors: Record<string, string> = {};
	if (!input || typeof input !== 'object') {
		return { ok: false, errors: { _root: 'body must be an object' } };
	}
	const b = input as ConnectorInput;

	const name = str(b.name);
	if (!name) errors.name = 'required';
	else if (!SLUG_RE.test(name))
		errors.name = 'lowercase a–z, 0–9, hyphens, 2–50 chars, must start with a–z or 0–9';

	const label = str(b.label);
	if (!label) errors.label = 'required';
	else if (label.length > 100) errors.label = 'max 100 chars';

	const baseUrl = str(b.base_url);
	if (!baseUrl) errors.base_url = 'required';
	else if (!HTTP_URL_RE.test(baseUrl)) errors.base_url = 'must start with http:// or https://';

	let pathPrefix: string | null = null;
	const pp = str(b.path_prefix);
	if (pp) {
		if (!pp.startsWith('/')) errors.path_prefix = 'must start with /';
		else pathPrefix = pp;
	}

	const authType = str(b.auth_type) ?? 'none';
	if (!CONNECTOR_AUTH_TYPES.includes(authType as 'none')) {
		errors.auth_type = `must be one of ${CONNECTOR_AUTH_TYPES.join(', ')}`;
	}

	const enabled = b.enabled === undefined ? true : Boolean(b.enabled);

	let linkTemplate = DEFAULT_LINK_TEMPLATE;
	const lt = str(b.link_template);
	if (lt !== null) {
		if (!lt.includes('{id}')) errors.link_template = 'must contain {id}';
		else if (lt.length > 500) errors.link_template = 'max 500 chars';
		else linkTemplate = lt;
	}

	if (Object.keys(errors).length > 0) return { ok: false, errors };

	return {
		ok: true,
		value: {
			name: name!,
			label: label!,
			baseUrl: baseUrl!,
			pathPrefix,
			authType: 'none',
			enabled,
			linkTemplate
		}
	};
}

/** Patch validation — every field optional, but each provided field must pass. */
export function validateConnectorPatch(input: unknown):
	| { ok: true; value: Partial<ConnectorValidated['value']> }
	| InvalidResult {
	const errors: Record<string, string> = {};
	if (!input || typeof input !== 'object') {
		return { ok: false, errors: { _root: 'body must be an object' } };
	}
	const b = input as ConnectorInput;
	const out: Partial<ConnectorValidated['value']> = {};

	if (b.name !== undefined) {
		const v = str(b.name);
		if (!v) errors.name = 'required';
		else if (!SLUG_RE.test(v))
			errors.name = 'lowercase a–z, 0–9, hyphens, 2–50 chars, must start with a–z or 0–9';
		else out.name = v;
	}
	if (b.label !== undefined) {
		const v = str(b.label);
		if (!v) errors.label = 'required';
		else if (v.length > 100) errors.label = 'max 100 chars';
		else out.label = v;
	}
	if (b.base_url !== undefined) {
		const v = str(b.base_url);
		if (!v) errors.base_url = 'required';
		else if (!HTTP_URL_RE.test(v)) errors.base_url = 'must start with http:// or https://';
		else out.baseUrl = v;
	}
	if (b.path_prefix !== undefined) {
		const v = str(b.path_prefix);
		if (v === null) out.pathPrefix = null;
		else if (!v.startsWith('/')) errors.path_prefix = 'must start with /';
		else out.pathPrefix = v;
	}
	if (b.auth_type !== undefined) {
		const v = str(b.auth_type);
		if (!v || !CONNECTOR_AUTH_TYPES.includes(v as 'none'))
			errors.auth_type = `must be one of ${CONNECTOR_AUTH_TYPES.join(', ')}`;
		else out.authType = 'none';
	}
	if (b.enabled !== undefined) out.enabled = Boolean(b.enabled);
	if (b.link_template !== undefined) {
		const v = str(b.link_template);
		if (v === null) errors.link_template = 'required';
		else if (!v.includes('{id}')) errors.link_template = 'must contain {id}';
		else if (v.length > 500) errors.link_template = 'max 500 chars';
		else out.linkTemplate = v;
	}

	if (Object.keys(errors).length > 0) return { ok: false, errors };
	return { ok: true, value: out };
}

// ---------- Linked-document body ----------

export type LinkDocumentInput = {
	connector_id?: string;
	external_url?: string;
	filename?: string;
};

export type LinkDocValidated = {
	ok: true;
	value: { connectorId: string; externalUrl: string; filename: string };
};

/** Validates a JSON body for the link-from-connector flow. Existence of the
 *  connector + its enabled flag is checked separately by the handler. */
export function validateLinkDocument(input: unknown): LinkDocValidated | InvalidResult {
	const errors: Record<string, string> = {};
	if (!input || typeof input !== 'object') {
		return { ok: false, errors: { _root: 'body must be an object' } };
	}
	const b = input as LinkDocumentInput;

	const connectorId = str(b.connector_id);
	if (!connectorId) errors.connector_id = 'required';
	else if (!UUID_RE.test(connectorId)) errors.connector_id = 'must be UUID';

	const externalUrl = str(b.external_url);
	if (!externalUrl) errors.external_url = 'required';
	else if (!HTTP_URL_RE.test(externalUrl))
		errors.external_url = 'must start with http:// or https://';

	const filename = str(b.filename);
	if (!filename) errors.filename = 'required';
	else if (filename.length > 255) errors.filename = 'max 255 chars';

	if (Object.keys(errors).length > 0) return { ok: false, errors };
	return { ok: true, value: { connectorId: connectorId!, externalUrl: externalUrl!, filename: filename! } };
}
