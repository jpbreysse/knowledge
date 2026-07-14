import { inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { asset, type AssetClass, type AssetClassField } from './db/schema';
import { createAsset } from './asset-service';
import { validateAsset } from './validation';

// v1 scope: one CSV = one class. `object` fields are excluded from the
// template and ignored on upload (set them via the form or API instead).
//
// Division of labour: this module owns the CSV concerns — header matching,
// cell coercion (incl. the forgiving yes/no booleans), tag→UUID resolution,
// auto-numbering, per-row/column error reporting. Structural validation and
// persistence go through the same code path as every API write: validateAsset
// for shape, createAsset for the insert.

const MAX_ROWS = 1000;

// ---------- CSV parsing (RFC 4180-ish: quotes, escaped quotes, CRLF) ----------

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else inQuotes = false;
			} else cell += c;
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(cell);
			cell = '';
			rows.push(row);
			row = [];
		} else {
			cell += c;
		}
	}
	if (cell.length > 0 || row.length > 0) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------- Column model ----------

export type ImportColumn = {
	key: string; // header name, e.g. 'tag' or an attribute field name
	kind: 'base' | 'attribute';
	field?: AssetClassField;
	required: boolean;
};

export function importColumns(classDef: AssetClass): ImportColumn[] {
	const cols: ImportColumn[] = [
		// tag optional when the class can auto-number from id_prefix
		{ key: 'tag', kind: 'base', required: !classDef.idPrefix },
		{ key: 'name', kind: 'base', required: true },
		{ key: 'parent_tag', kind: 'base', required: false },
		{ key: 'confidentiality', kind: 'base', required: false }
	];
	for (const f of classDef.attributeFields ?? []) {
		if (f.type === 'object') continue;
		cols.push({ key: f.name, kind: 'attribute', field: f, required: !!f.required });
	}
	return cols;
}

function exampleCell(col: ImportColumn, classDef: AssetClass): string {
	if (col.kind === 'base') {
		switch (col.key) {
			case 'tag':
				return classDef.idPrefix ? '' : 'my-tag-001';
			case 'name':
				return 'Example name';
			case 'parent_tag':
				return '';
			case 'confidentiality':
				return classDef.confidentialityDefault ?? '';
		}
	}
	const f = col.field!;
	switch (f.type) {
		case 'number':
			return '42';
		case 'date':
			return '2026-01-31';
		case 'select':
			return f.options?.[0] ?? '';
		case 'boolean':
			return 'true';
		case 'list':
			return 'first;second';
		case 'ref':
			return 'target-tag';
		case 'array_ref':
			return 'tag-1;tag-2';
		default:
			return 'text';
	}
}

function csvCell(v: string): string {
	if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
	return v;
}

/** Header row + one commented example row. Lines starting with # are skipped on upload. */
export function renderTemplateCsv(classDef: AssetClass): string {
	const cols = importColumns(classDef);
	const header = cols.map((c) => csvCell(c.key)).join(',');
	const example = cols.map((c, i) => {
		const cell = exampleCell(c, classDef);
		return csvCell(i === 0 ? `#${cell || 'example'}` : cell);
	});
	return header + '\n' + example.join(',') + '\n';
}

// ---------- Validation ----------

export type ImportRow = {
	/** 1-based line number in the CSV file (header is line 1). */
	line: number;
	/** Raw cell text by column key — for preview display. */
	cells: Record<string, string>;
	/** Display tag; '(auto)' when empty and the class auto-numbers. */
	tag: string;
	name: string;
	errors: Record<string, string>;
	/** Converted values, only meaningful when errors is empty. */
	parsed?: {
		tag: string | null; // null = auto-generate at commit
		name: string;
		parentId: string | null;
		confidentiality: string | null;
		attributes: Record<string, unknown>;
	};
};

export type ImportValidation = {
	ok: boolean;
	fileErrors: string[];
	unknownColumns: string[];
	columns: string[];
	rows: ImportRow[];
	summary: { total: number; valid: number; invalid: number };
};

type TagInfo = { id: string; classCode: string };

async function lookupTags(tags: string[]): Promise<Map<string, TagInfo>> {
	const unique = Array.from(new Set(tags.filter(Boolean)));
	if (unique.length === 0) return new Map();
	const rows = await db
		.select({ id: asset.id, tag: asset.tag, classCode: asset.classCode })
		.from(asset)
		.where(inArray(asset.tag, unique));
	return new Map(rows.map((r) => [r.tag, { id: r.id, classCode: r.classCode }]));
}

function splitList(cell: string): string[] {
	return cell
		.split(';')
		.map((s) => s.trim())
		.filter((s) => s !== '');
}

function refError(tag: string, info: TagInfo | undefined, filter?: string | string[]): string | null {
	if (!info) return `tag '${tag}' not found`;
	if (filter) {
		const allowed = Array.isArray(filter) ? filter : [filter];
		if (!allowed.includes(info.classCode))
			return `'${tag}' must be class ${allowed.join(' or ')} (got ${info.classCode})`;
	}
	return null;
}

export async function validateImport(classDef: AssetClass, csvText: string): Promise<ImportValidation> {
	const cols = importColumns(classDef);
	const fileErrors: string[] = [];
	const empty = (msg: string): ImportValidation => ({
		ok: false,
		fileErrors: [msg],
		unknownColumns: [],
		columns: cols.map((c) => c.key),
		rows: [],
		summary: { total: 0, valid: 0, invalid: 0 }
	});

	const parsed = parseCsv(csvText);
	if (parsed.length === 0) return empty('file is empty');

	// Header matching — case-insensitive, trimmed.
	const headerCells = parsed[0].map((h) => h.trim());
	const byKey = new Map(cols.map((c) => [c.key.toLowerCase(), c]));
	const mapping: (ImportColumn | null)[] = headerCells.map((h) => byKey.get(h.toLowerCase()) ?? null);
	const unknownColumns = headerCells.filter((h, i) => h !== '' && !mapping[i]);
	const seen = new Set<string>();
	for (const m of mapping) {
		if (!m) continue;
		if (seen.has(m.key)) fileErrors.push(`duplicate column '${m.key}'`);
		seen.add(m.key);
	}
	const missingRequired = cols.filter((c) => c.required && !seen.has(c.key)).map((c) => c.key);
	if (missingRequired.length > 0)
		fileErrors.push(`missing required column(s): ${missingRequired.join(', ')}`);
	if (!seen.has('name')) {
		if (!missingRequired.includes('name')) fileErrors.push(`missing required column(s): name`);
	}

	// Data rows — skip comment rows (first cell starts with '#').
	const dataRows: { line: number; cells: string[] }[] = [];
	for (let i = 1; i < parsed.length; i++) {
		const first = (parsed[i][0] ?? '').trim();
		if (first.startsWith('#')) continue;
		dataRows.push({ line: i + 1, cells: parsed[i] });
	}
	if (dataRows.length === 0) fileErrors.push('no data rows');
	if (dataRows.length > MAX_ROWS) fileErrors.push(`too many rows (${dataRows.length} > ${MAX_ROWS})`);

	if (fileErrors.length > 0)
		return {
			ok: false,
			fileErrors,
			unknownColumns,
			columns: cols.map((c) => c.key),
			rows: [],
			summary: { total: dataRows.length, valid: 0, invalid: dataRows.length }
		};

	// Collect every tag the file mentions so existence checks run in one query:
	// row tags (DB-duplicate check), parent tags, and ref/array_ref target tags.
	const mentioned: string[] = [];
	const rowValues: Record<string, string>[] = dataRows.map(({ cells }) => {
		const v: Record<string, string> = {};
		mapping.forEach((col, i) => {
			if (col) v[col.key] = (cells[i] ?? '').trim();
		});
		return v;
	});
	for (const v of rowValues) {
		if (v.tag) mentioned.push(v.tag);
		if (v.parent_tag) mentioned.push(v.parent_tag);
		for (const col of cols) {
			if (col.kind !== 'attribute') continue;
			const cell = v[col.key];
			if (!cell) continue;
			if (col.field!.type === 'ref') mentioned.push(cell);
			else if (col.field!.type === 'array_ref') mentioned.push(...splitList(cell));
		}
	}
	const tagMap = await lookupTags(mentioned);

	// Per-row: CSV concerns here, structure delegated to validateAsset.
	const fileTags = new Map<string, number>(); // tag -> first line using it
	const rows: ImportRow[] = dataRows.map(({ line }, idx) => {
		const v = rowValues[idx];
		const importErrors: Record<string, string> = {};
		const attributes: Record<string, unknown> = {};

		// Tag concerns the validator can't know about: register duplicates,
		// in-file duplicates, auto-numbering eligibility.
		const tag = v.tag ?? '';
		if (tag) {
			if (tagMap.has(tag)) importErrors.tag = 'tag already exists in register';
			else if (fileTags.has(tag)) importErrors.tag = `duplicate of line ${fileTags.get(tag)}`;
			else fileTags.set(tag, line);
		} else if (!classDef.idPrefix) {
			importErrors.tag = 'required (class has no id_prefix for auto-numbering)';
		}

		let parentId: string | null = null;
		if (v.parent_tag) {
			const info = tagMap.get(v.parent_tag);
			if (!info) importErrors.parent_tag = `tag '${v.parent_tag}' not found`;
			else parentId = info.id;
		}

		// CSV-cell coercion only. Scalars pass through as strings — validateAsset
		// owns type checks and numeric/boolean coercion, same as the JSON API.
		for (const col of cols) {
			if (col.kind !== 'attribute') continue;
			const f = col.field!;
			const cell = v[col.key] ?? '';
			if (cell === '') continue; // absent key; required-ness is the validator's call
			switch (f.type) {
				case 'boolean': {
					// CSV forgiveness: yes/no and any casing accepted here; the JSON
					// API stays strict (true/false/1/0).
					const low = cell.toLowerCase();
					attributes[f.name] = low === 'yes' ? 'true' : low === 'no' ? 'false' : low;
					break;
				}
				case 'list':
					attributes[f.name] = splitList(cell);
					break;
				case 'ref': {
					const err = refError(cell, tagMap.get(cell), f.asset_class_filter);
					if (err) importErrors[col.key] = err;
					else attributes[f.name] = tagMap.get(cell)!.id;
					break;
				}
				case 'array_ref': {
					const tags = splitList(cell);
					const ids: string[] = [];
					for (const t of tags) {
						const err = refError(t, tagMap.get(t), f.asset_class_filter);
						if (err) {
							importErrors[col.key] = err;
							break;
						}
						ids.push(tagMap.get(t)!.id);
					}
					if (!importErrors[col.key]) attributes[f.name] = ids;
					break;
				}
				default:
					attributes[f.name] = cell;
			}
		}

		// Structural validation via the shared validator. Auto-numbered rows get
		// a synthetic placeholder tag (never persisted — commitImport generates
		// the real one); CSV empty confidentiality inherits the class default.
		const autoTag = !tag && !!classDef.idPrefix;
		const validated = validateAsset(
			{
				tag: autoTag ? `${classDef.idPrefix}000` : tag,
				name: v.name ?? '',
				class_code: classDef.code,
				parent_id: parentId,
				confidentiality: v.confidentiality || classDef.confidentialityDefault || null,
				attributes
			},
			classDef
		);

		// Translate validator keys to CSV columns; CSV-layer errors win on clash.
		const errors: Record<string, string> = {};
		if (!validated.ok) {
			for (const [key, msg] of Object.entries(validated.errors)) {
				if (key === 'tag' && autoTag) continue;
				const colKey =
					key === 'parent_id' ? 'parent_tag' : key.replace(/^attributes\./, '').replace(/\.\d+$/, '');
				if (!(colKey in errors)) errors[colKey] = msg;
			}
		}
		Object.assign(errors, importErrors);

		const row: ImportRow = {
			line,
			cells: v,
			tag: tag || '(auto)',
			name: v.name ?? '',
			errors
		};
		if (Object.keys(errors).length === 0 && validated.ok) {
			row.parsed = {
				tag: tag || null,
				name: validated.value.name,
				parentId: validated.value.parentId,
				confidentiality: validated.value.confidentiality,
				attributes: validated.value.attributes
			};
		}
		return row;
	});

	const valid = rows.filter((r) => r.parsed).length;
	return {
		ok: valid === rows.length,
		fileErrors: [],
		unknownColumns,
		columns: cols.map((c) => c.key),
		rows,
		summary: { total: rows.length, valid, invalid: rows.length - valid }
	};
}

// ---------- Commit ----------

export type ImportCommitResult = {
	created: { id: string; tag: string; line: number }[];
	skippedLines: number[];
};

/**
 * Persist every valid row of an already-passed validation. Caller decides
 * soft/hard semantics BEFORE calling (hard mode with invalid rows should never
 * reach here). Auto-numbered tags are generated inside the transaction from
 * the class id_prefix (max existing numeric suffix + 1).
 *
 * Each row goes through createAsset() — the single write choke point — with
 * this batch's transaction passed through, so all rows commit or roll back
 * together exactly as before.
 */
export async function commitImport(
	classDef: AssetClass,
	validation: ImportValidation
): Promise<ImportCommitResult> {
	const validRows = validation.rows.filter((r) => r.parsed);
	const skippedLines = validation.rows.filter((r) => !r.parsed).map((r) => r.line);

	const created = await db.transaction(async (tx) => {
		// Auto-tag numbering: highest numeric suffix among existing tags with
		// this prefix, minus any explicit tags in the file that share it.
		let next = 0;
		const prefix = classDef.idPrefix;
		if (prefix && validRows.some((r) => r.parsed!.tag === null)) {
			const existing = await tx
				.select({ tag: asset.tag })
				.from(asset)
				.where(sql`${asset.tag} LIKE ${prefix + '%'}`);
			const suffixes = existing
				.map((r) => r.tag.slice(prefix.length))
				.concat(
					validRows
						.filter((r) => r.parsed!.tag?.startsWith(prefix))
						.map((r) => r.parsed!.tag!.slice(prefix.length))
				);
			for (const s of suffixes) {
				const m = s.match(/^(\d+)$/);
				if (m) next = Math.max(next, parseInt(m[1], 10));
			}
		}

		const out: ImportCommitResult['created'] = [];
		for (const r of validRows) {
			const p = r.parsed!;
			let tag = p.tag;
			if (tag === null) {
				next += 1;
				tag = `${prefix}${String(next).padStart(3, '0')}`;
			}
			const result = await createAsset(
				{
					tag,
					name: p.name,
					class_code: classDef.code,
					parent_id: p.parentId,
					confidentiality: p.confidentiality,
					attributes: p.attributes
				},
				'import',
				tx
			);
			if (!result.ok)
				throw new Error(`import aborted at line ${r.line}: ${JSON.stringify(result.errors)}`);
			out.push({ id: result.row.id, tag: result.row.tag, line: r.line });
		}
		return out;
	});

	return { created, skippedLines };
}
