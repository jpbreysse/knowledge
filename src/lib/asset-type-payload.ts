import type { AssetTypeFormValue } from '$lib/components/AssetTypeForm.svelte';

/** Convert the comma-separated + flat form value into the JSON the API expects. */
export function toAssetTypePayload(v: AssetTypeFormValue) {
	const splitCsv = (s: string) =>
		s
			.split(',')
			.map((x) => x.trim())
			.filter((x) => x.length > 0);

	return {
		code: v.code,
		label: v.label,
		family: v.family,
		description: v.description || null,
		color: v.color || null,
		enabled: v.enabled,
		attribute_fields: v.attribute_fields.map((f) => {
			const out: Record<string, unknown> = {
				name: f.name,
				label: f.label,
				type: f.type
			};
			if (f.required) out.required = true;
			if (f.group) out.group = f.group;
			if (f.unit) out.unit = f.unit;
			if (f.type === 'select' && f.options) out.options = splitCsv(f.options);
			if ((f.type === 'ref' || f.type === 'array_ref') && f.asset_class_filter) {
				const codes = splitCsv(f.asset_class_filter);
				if (codes.length === 1) out.asset_class_filter = codes[0];
				else if (codes.length > 1) out.asset_class_filter = codes;
			}
			return out;
		}),
		valid_lifecycle_states: splitCsv(v.valid_lifecycle_states),
		applicable_tabs: splitCsv(v.applicable_tabs)
	};
}

export function fromAssetTypeRow(row: {
	code: string;
	label: string;
	family: string;
	description: string | null;
	color: string | null;
	enabled: boolean;
	attributeFields: {
		name: string;
		label: string;
		type: string;
		required?: boolean;
		group?: string;
		unit?: string;
		options?: string[];
		asset_class_filter?: string | string[];
	}[];
	validLifecycleStates: string[];
	applicableTabs: string[];
}): AssetTypeFormValue {
	return {
		code: row.code,
		label: row.label,
		family: row.family as AssetTypeFormValue['family'],
		description: row.description ?? '',
		color: row.color ?? '#d4d4d4',
		enabled: row.enabled,
		attribute_fields: row.attributeFields.map((f) => ({
			name: f.name,
			label: f.label,
			type: f.type as AssetTypeFormValue['attribute_fields'][number]['type'],
			required: !!f.required,
			group: f.group ?? '',
			unit: f.unit ?? '',
			options: (f.options ?? []).join(', '),
			asset_class_filter: Array.isArray(f.asset_class_filter)
				? f.asset_class_filter.join(', ')
				: (f.asset_class_filter ?? '')
		})),
		valid_lifecycle_states: (row.validLifecycleStates ?? []).join(', '),
		applicable_tabs: (row.applicableTabs ?? []).join(', ')
	};
}
