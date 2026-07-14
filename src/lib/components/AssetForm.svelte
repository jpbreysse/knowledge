<script lang="ts" module>
	// v3.1: the 7 equipment-flavoured fields (serial_no, manufacturer, model,
	// location, criticality, lifecycle_state, commissioning_date) are no longer
	// on the AssetForm value — they live in `attributes` JSONB and each class
	// declares which ones it wants via asset_class.attribute_fields.
	export type AssetFormValue = {
		tag: string;
		name: string;
		class_code: string;
		parent_id: string;
		attributes: Record<string, unknown>;
		content: Record<string, unknown> | null;
		confidentiality: string;
		version: string;
		supersedes_asset_id: string;
	};

	export function emptyAssetFormValue(): AssetFormValue {
		return {
			tag: '',
			name: '',
			class_code: 'OTHER',
			parent_id: '',
			attributes: {},
			content: null,
			confidentiality: '',
			version: '',
			supersedes_asset_id: ''
		};
	}
</script>

<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import TiptapEditor from './TiptapEditor.svelte';
	import AssetPicker, { type AssetPickerOption } from './AssetPicker.svelte';
	import X from '@lucide/svelte/icons/x';
	import { CLASS_CODES } from '$lib/constants';
	import type { AssetClass, AssetClassField } from '$lib/server/db/schema';

	let {
		value = $bindable<AssetFormValue>(emptyAssetFormValue()),
		errors = {},
		editable = true,
		assetClasses = [],
		refLookup
	}: {
		value?: AssetFormValue;
		errors?: Record<string, string>;
		editable?: boolean;
		assetClasses?: AssetClass[];
		refLookup?: Map<string, AssetPickerOption>;
	} = $props();

	// Class dropdown options — sourced from the DB when available, otherwise
	// fall back to the legacy constant so the form still works pre-taxonomy.
	const classOptions = $derived.by(() => {
		if (assetClasses.length > 0) {
			return assetClasses
				.filter((c) => c.enabled)
				.map((c) => ({ code: c.code, label: `${c.code} — ${c.label}` }));
		}
		return CLASS_CODES.map((c) => ({ code: c, label: c }));
	});

	const currentClass = $derived(
		assetClasses.find((c) => c.code === value.class_code) ?? null
	);

	// v3.1: lifecycle dropdown moved off the core form — each equipment class
	// now declares `lifecycle_state` as a `select` field in its attribute
	// schema (see seed 008), so it renders dynamically alongside its other
	// attribute fields for classes that want it.

	// Group attribute fields by their `group` for visual segmentation.
	type FieldGroup = { name: string; fields: AssetClassField[] };
	const fieldGroups = $derived.by<FieldGroup[]>(() => {
		const fields = currentClass?.attributeFields ?? [];
		const groups = new Map<string, AssetClassField[]>();
		for (const f of fields) {
			const g = f.group ?? '';
			if (!groups.has(g)) groups.set(g, []);
			groups.get(g)!.push(f);
		}
		return Array.from(groups.entries()).map(([name, fields]) => ({ name, fields }));
	});

	function err(k: string) {
		return errors?.[k];
	}

	// ----- per-type setters: keep value.attributes in sync without losing
	//       off-schema keys (re-spread original each time).
	function setAttr(name: string, v: unknown) {
		const next = { ...value.attributes };
		if (v === undefined || v === '' || v === null) delete next[name];
		else next[name] = v;
		value.attributes = next;
	}

	function attrAsText(name: string): string {
		const v = value.attributes[name];
		if (v === undefined || v === null) return '';
		if (typeof v === 'object') return JSON.stringify(v);
		return String(v);
	}

	function attrAsNumber(name: string): string {
		const v = value.attributes[name];
		if (v === undefined || v === null || v === '') return '';
		return String(v);
	}

	function attrAsBoolean(name: string): boolean {
		return Boolean(value.attributes[name]);
	}

	function attrAsList(name: string): string {
		const v = value.attributes[name];
		if (!Array.isArray(v)) return '';
		return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ');
	}

	function attrAsJson(name: string): string {
		const v = value.attributes[name];
		if (v === undefined || v === null) return '';
		try {
			return JSON.stringify(v, null, 2);
		} catch {
			return '';
		}
	}

	function setListFromCsv(name: string, csv: string) {
		const items = csv
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		setAttr(name, items.length > 0 ? items : undefined);
	}

	function setJsonFromText(name: string, text: string) {
		const trimmed = text.trim();
		if (!trimmed) {
			setAttr(name, undefined);
			return;
		}
		try {
			const parsed = JSON.parse(trimmed);
			setAttr(name, parsed);
		} catch {
			// Keep the raw string in the form so the user sees their input until
			// they fix it; validation will reject on save.
			setAttr(name, text);
		}
	}

	function fieldLabel(f: AssetClassField): string {
		return f.unit ? `${f.label} (${f.unit})` : f.label;
	}

	// Off-schema attributes — anything in value.attributes that isn't declared
	// by the current class. Surfaced read-only so the user can see (and not
	// silently lose) data that pre-dates the schema.
	const declaredNames = $derived(new Set(currentClass?.attributeFields.map((f) => f.name) ?? []));
	const offSchemaKeys = $derived(
		Object.keys(value.attributes).filter((k) => !declaredNames.has(k))
	);

	// Local cache of options picked during this session, so array_ref chips
	// render correctly in the new-asset flow (where refLookup is empty).
	let pickedOptions = $state(new Map<string, AssetPickerOption>());
	function cachePick(o: AssetPickerOption | undefined) {
		if (!o) return;
		const next = new Map(pickedOptions);
		next.set(o.id, o);
		pickedOptions = next;
	}
	function chipFor(id: string): AssetPickerOption | undefined {
		return refLookup?.get(id) ?? pickedOptions.get(id);
	}
</script>

<div class="grid gap-6">
	<!-- Identity -->
	<section class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div class="grid gap-1.5">
			<Label for="tag">Tag *</Label>
			<Input id="tag" bind:value={value.tag} disabled={!editable} />
			{#if err('tag')}<p class="text-destructive text-xs">{err('tag')}</p>{/if}
		</div>
		<div class="grid gap-1.5">
			<Label for="name">Name *</Label>
			<Input id="name" bind:value={value.name} disabled={!editable} />
			{#if err('name')}<p class="text-destructive text-xs">{err('name')}</p>{/if}
		</div>
		<div class="grid gap-1.5">
			<Label for="class_code">Class *</Label>
			<select
				id="class_code"
				bind:value={value.class_code}
				disabled={!editable}
				class="border-input bg-background h-9 rounded-md border px-3 text-sm"
			>
				{#each classOptions as c}
					<option value={c.code}>{c.label}</option>
				{/each}
			</select>
			{#if err('class_code')}<p class="text-destructive text-xs">{err('class_code')}</p>{/if}
			{#if currentClass?.description}
				<p class="text-muted-foreground text-xs">{currentClass.description}</p>
			{/if}
		</div>
		<div class="grid gap-1.5 md:col-span-2">
			<Label for="parent_id">Parent asset <span class="text-muted-foreground font-normal">(optional — where this sits in the hierarchy)</span></Label>
			<AssetPicker
				value={value.parent_id || null}
				onChange={(id, opt) => {
					cachePick(opt);
					value.parent_id = id ?? '';
				}}
				{refLookup}
				disabled={!editable}
				placeholder="Search parent by tag or name…"
			/>
			{#if err('parent_id')}<p class="text-destructive text-xs">{err('parent_id')}</p>{/if}
		</div>
		<!-- v3.1: serial number / manufacturer / model / location / criticality /
		     lifecycle / commissioning date used to be hardcoded here. They moved
		     into `attributes` JSONB and each class declares which ones it wants
		     via `asset_class.attribute_fields` — renders below as dynamic fields. -->


		<!-- Versioning (v3.0). Optional on every asset; mainly used by IER / METH / PLAY. -->
		<div class="grid gap-1.5">
			<Label for="version">Version</Label>
			<Input
				id="version"
				placeholder="v1.0-final"
				bind:value={value.version}
				disabled={!editable}
			/>
			{#if err('version')}<p class="text-destructive text-xs">{err('version')}</p>{/if}
		</div>
		<div class="grid gap-1.5">
			<Label for="supersedes">Supersedes (prior version)</Label>
			<AssetPicker
				value={value.supersedes_asset_id || null}
				onChange={(id, opt) => {
					cachePick(opt);
					value.supersedes_asset_id = id ?? '';
				}}
				filter={currentClass?.code}
				{refLookup}
				disabled={!editable}
				placeholder="Search prior version…"
			/>
			{#if err('supersedes_asset_id')}<p class="text-destructive text-xs">{err('supersedes_asset_id')}</p>{/if}
		</div>
	</section>

	<!-- Dynamic attribute fields driven by the class's schema -->
	{#if fieldGroups.length > 0}
		{#each fieldGroups as group}
			<section class="space-y-3">
				<h3 class="text-sm font-semibold">
					{group.name || (currentClass?.label ?? 'Attributes')}
				</h3>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					{#each group.fields as f}
						<div
							class="grid gap-1.5"
							class:md:col-span-2={f.type === 'object' || f.type === 'list' || f.type === 'array_ref'}
						>
							<Label for={`attr-${f.name}`}>
								{fieldLabel(f)}{#if f.required}<span class="text-destructive ml-0.5">*</span>{/if}
							</Label>
							{#if f.type === 'number'}
								<Input
									id={`attr-${f.name}`}
									type="number"
									step="any"
									value={attrAsNumber(f.name)}
									oninput={(e) => {
										const v = (e.currentTarget as HTMLInputElement).value;
										setAttr(f.name, v === '' ? undefined : Number(v));
									}}
									disabled={!editable}
								/>
							{:else if f.type === 'date'}
								<Input
									id={`attr-${f.name}`}
									type="date"
									value={attrAsText(f.name)}
									oninput={(e) =>
										setAttr(f.name, (e.currentTarget as HTMLInputElement).value || undefined)}
									disabled={!editable}
								/>
							{:else if f.type === 'boolean'}
								<label class="flex h-9 items-center gap-2">
									<input
										id={`attr-${f.name}`}
										type="checkbox"
										class="size-4"
										checked={attrAsBoolean(f.name)}
										onchange={(e) =>
											setAttr(f.name, (e.currentTarget as HTMLInputElement).checked)}
										disabled={!editable}
									/>
									<span class="text-muted-foreground text-xs">
										{attrAsBoolean(f.name) ? 'Yes' : 'No'}
									</span>
								</label>
							{:else if f.type === 'select'}
								<select
									id={`attr-${f.name}`}
									class="border-input bg-background h-9 rounded-md border px-3 text-sm"
									value={attrAsText(f.name)}
									onchange={(e) =>
										setAttr(
											f.name,
											(e.currentTarget as HTMLSelectElement).value || undefined
										)}
									disabled={!editable}
								>
									<option value="">—</option>
									{#each f.options ?? [] as opt}
										<option value={opt}>{opt}</option>
									{/each}
								</select>
							{:else if f.type === 'list'}
								<Input
									id={`attr-${f.name}`}
									placeholder="comma, separated, values"
									value={attrAsList(f.name)}
									oninput={(e) =>
										setListFromCsv(f.name, (e.currentTarget as HTMLInputElement).value)}
									disabled={!editable}
								/>
								<p class="text-muted-foreground text-xs">
									Comma-separated. Stored as an array.
								</p>
							{:else if f.type === 'object'}
								<textarea
									id={`attr-${f.name}`}
									rows="4"
									class="border-input bg-background min-h-[6rem] rounded-md border px-3 py-2 font-mono text-xs"
									value={attrAsJson(f.name)}
									oninput={(e) =>
										setJsonFromText(f.name, (e.currentTarget as HTMLTextAreaElement).value)}
									disabled={!editable}
								></textarea>
								<p class="text-muted-foreground text-xs">JSON object.</p>
							{:else if f.type === 'ref'}
								<AssetPicker
									value={(value.attributes[f.name] as string | null | undefined) ?? null}
									onChange={(id, opt) => {
										cachePick(opt);
										setAttr(f.name, id ?? undefined);
									}}
									filter={f.asset_class_filter}
									{refLookup}
									disabled={!editable}
								/>
							{:else if f.type === 'array_ref'}
								{@const arr = Array.isArray(value.attributes[f.name])
									? (value.attributes[f.name] as string[])
									: []}
								<div class="space-y-2">
									{#each arr as id, i (id + ':' + i)}
										{@const opt = chipFor(id)}
										<div
											class="border-input bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-1.5"
										>
											<a
												href={`/assets/${id}`}
												class="flex min-w-0 flex-1 items-baseline gap-2 hover:underline"
											>
												<span class="font-mono text-sm">{opt?.tag ?? id.slice(0, 8) + '…'}</span>
												<span class="text-muted-foreground truncate text-xs">
													{opt?.name ?? '(loading)'}
												</span>
												{#if opt?.classCode}
													<span class="text-muted-foreground hidden text-[0.65rem] uppercase sm:inline">
														{opt.classCode}
													</span>
												{/if}
											</a>
											{#if editable}
												<button
													type="button"
													class="text-muted-foreground hover:text-destructive shrink-0 rounded p-1"
													onclick={() => {
														const next = arr.filter((_, idx) => idx !== i);
														setAttr(f.name, next.length > 0 ? next : undefined);
													}}
													aria-label="Remove"
												>
													<X class="size-3.5" />
												</button>
											{/if}
										</div>
									{/each}
									{#if editable}
										<AssetPicker
											value={null}
											onChange={(id, opt) => {
												if (!id || arr.includes(id)) return;
												cachePick(opt);
												setAttr(f.name, [...arr, id]);
											}}
											filter={f.asset_class_filter}
											{refLookup}
											placeholder={arr.length === 0 ? 'Add reference…' : 'Add another…'}
										/>
									{/if}
								</div>
							{:else}
								<Input
									id={`attr-${f.name}`}
									type="text"
									value={attrAsText(f.name)}
									oninput={(e) =>
										setAttr(f.name, (e.currentTarget as HTMLInputElement).value || undefined)}
									disabled={!editable}
								/>
							{/if}
							{#if err(`attributes.${f.name}`)}
								<p class="text-destructive text-xs">{err(`attributes.${f.name}`)}</p>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}

	<!-- Off-schema attributes: preserved but not editable per-field; users can
	     still touch them via raw JSON if needed in a follow-up. -->
	{#if offSchemaKeys.length > 0}
		<section class="space-y-2">
			<h3 class="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
				Other attributes (not in class schema)
			</h3>
			<dl class="bg-muted/30 grid grid-cols-1 gap-x-4 gap-y-1 rounded-md border p-3 text-xs sm:grid-cols-[max-content_1fr]">
				{#each offSchemaKeys as k}
					<dt class="text-muted-foreground font-mono">{k}</dt>
					<dd class="break-all font-mono">{attrAsText(k)}</dd>
				{/each}
			</dl>
			<p class="text-muted-foreground text-xs">
				These keys aren't declared on <span class="font-mono">{value.class_code}</span> but are
				retained on save. Add them to the class schema in
				<a href="/asset-types" class="underline">Asset types</a> to make them editable.
			</p>
		</section>
	{/if}

	<section class="space-y-2">
		<Label>Description</Label>
		{#key editable}
			<TiptapEditor bind:content={value.content} {editable} />
		{/key}
	</section>
</div>
