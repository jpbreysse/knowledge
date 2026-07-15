import { sql, type SQL } from 'drizzle-orm';
import { asset, type AssetClass, type AssetClassField } from './db/schema';

/**
 * Structured attribute queries (docs/structured-query-spec.md).
 *
 * URL convention: `attr.<field>` = equals (repeat the param for "one of"),
 * `attr.<field>.<op>` for typed operators:
 *   number  — gte, lte           date — before, after
 *   text    — contains           ref  — (equals only)
 *   select  — (equals / one-of)  array_ref — contains (an asset id)
 *   boolean — (equals true/false)
 *
 * Everything is validated against the class's attribute_fields — unknown
 * field, wrong operator for the type, or an unparseable value produces an
 * error entry instead of silently matching nothing. Casts are junk-safe:
 * a non-numeric string in a number field makes the row not match, never
 * a query error.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;

export type AttrFilter = {
	/** canonical param key, e.g. "attr.criticality.gte" */
	param: string;
	field: string;
	label: string;
	type: AssetClassField['type'];
	op: string;
	values: string[];
};

export type ParsedAttrQuery = {
	conds: SQL[];
	/** valid, applied filters — for chip rendering */
	active: AttrFilter[];
	/** human-readable problems — API returns 400, the page shows a banner */
	errors: string[];
};

/** JSONB text with a junk guard: NULL unless the stored text is numeric. */
function numExpr(field: string) {
	return sql`(CASE WHEN ${asset.attributes}->>${field} ~ '^-?\\d+(\\.\\d+)?$'
		THEN (${asset.attributes}->>${field})::numeric END)`;
}

function dateExpr(field: string) {
	return sql`(CASE WHEN ${asset.attributes}->>${field} ~ '^\\d{4}-\\d{2}-\\d{2}'
		THEN (substring(${asset.attributes}->>${field} from '^\\d{4}-\\d{2}-\\d{2}'))::date END)`;
}

function inList(field: string, values: string[]): SQL {
	if (values.length === 1) return sql`${asset.attributes}->>${field} = ${values[0]}`;
	return sql`(${sql.join(
		values.map((v) => sql`${asset.attributes}->>${field} = ${v}`),
		sql` OR `
	)})`;
}

export function parseAttrQuery(
	searchParams: URLSearchParams,
	classDef: AssetClass | null
): ParsedAttrQuery {
	const out: ParsedAttrQuery = { conds: [], active: [], errors: [] };

	// Collect attr.* params grouped by full key (so repeats become one-of).
	const grouped = new Map<string, string[]>();
	for (const [k, v] of searchParams.entries()) {
		if (!k.startsWith('attr.')) continue;
		if (v === '') continue;
		const list = grouped.get(k) ?? [];
		list.push(v);
		grouped.set(k, list);
	}
	if (grouped.size === 0) return out;

	if (!classDef) {
		out.errors.push('attribute filters require class_code');
		return out;
	}
	const fields = new Map(classDef.attributeFields.map((f) => [f.name, f]));

	for (const [param, values] of grouped.entries()) {
		const parts = param.split('.');
		// attr.<field> or attr.<field>.<op>
		const fieldName = parts[1] ?? '';
		const op = parts[2] ?? 'eq';
		const f = fields.get(fieldName);
		if (!f) {
			out.errors.push(`unknown field '${fieldName}' for class ${classDef.code}`);
			continue;
		}

		const fail = (msg: string) => out.errors.push(`${param}: ${msg}`);
		const activate = (cond: SQL) => {
			out.conds.push(cond);
			out.active.push({ param, field: f.name, label: f.label, type: f.type, op, values });
		};

		switch (f.type) {
			case 'number': {
				if (!['eq', 'gte', 'lte'].includes(op)) { fail(`operator '${op}' not valid for number`); break; }
				const v = values[0];
				if (!NUM_RE.test(v)) { fail('must be a number'); break; }
				const cmp = op === 'gte' ? sql`>=` : op === 'lte' ? sql`<=` : sql`=`;
				activate(sql`${numExpr(f.name)} ${cmp} ${Number(v)}`);
				break;
			}
			case 'date': {
				if (!['eq', 'before', 'after'].includes(op)) { fail(`operator '${op}' not valid for date`); break; }
				const v = values[0];
				if (!ISO_DATE_RE.test(v)) { fail('must be YYYY-MM-DD'); break; }
				const cmp = op === 'before' ? sql`<=` : op === 'after' ? sql`>=` : sql`=`;
				activate(sql`${dateExpr(f.name)} ${cmp} ${v}::date`);
				break;
			}
			case 'boolean': {
				if (op !== 'eq') { fail(`operator '${op}' not valid for boolean`); break; }
				const v = values[0];
				if (v !== 'true' && v !== 'false') { fail('must be true or false'); break; }
				activate(sql`${asset.attributes}->>${f.name} = ${v}`);
				break;
			}
			case 'text': {
				if (op === 'contains') {
					activate(sql`${asset.attributes}->>${f.name} ILIKE ${'%' + values[0] + '%'}`);
				} else if (op === 'eq') {
					activate(inList(f.name, values));
				} else fail(`operator '${op}' not valid for text`);
				break;
			}
			case 'select': {
				if (op !== 'eq') { fail(`operator '${op}' not valid for select`); break; }
				if (f.options?.length) {
					const bad = values.filter((v) => !f.options!.includes(v));
					if (bad.length) { fail(`not in options: ${bad.join(', ')}`); break; }
				}
				activate(inList(f.name, values));
				break;
			}
			case 'ref': {
				if (op !== 'eq') { fail(`operator '${op}' not valid for ref`); break; }
				if (!UUID_RE.test(values[0])) { fail('must be an asset UUID'); break; }
				activate(sql`${asset.attributes}->>${f.name} = ${values[0]}`);
				break;
			}
			case 'array_ref': {
				if (!['eq', 'contains'].includes(op)) { fail(`operator '${op}' not valid for array_ref`); break; }
				if (!UUID_RE.test(values[0])) { fail('must be an asset UUID'); break; }
				// jsonb `?` — does the array contain this string element
				activate(sql`${asset.attributes}->${f.name} ? ${values[0]}`);
				break;
			}
			default:
				fail(`type '${f.type}' not filterable`);
		}
	}

	return out;
}
