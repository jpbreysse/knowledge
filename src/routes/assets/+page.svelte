<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import ConditionBadge from '$lib/components/ConditionBadge.svelte';
	import { CONDITION_RATINGS } from '$lib/constants';
	import AssetPicker from '$lib/components/AssetPicker.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';
	import Search from '@lucide/svelte/icons/search';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import X from '@lucide/svelte/icons/x';
	import ListFilter from '@lucide/svelte/icons/list-filter';

	let { data } = $props();

	let searchInput = $state(data.filters.search);

	type SortKey = 'tag' | 'name' | 'class_code';

	function applyFilter(patch: Record<string, string>) {
		const url = new URL(page.url);
		for (const [k, v] of Object.entries(patch)) {
			if (v === '' || v === null) url.searchParams.delete(k);
			else url.searchParams.set(k, v);
		}
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}

	// ---- Structured attribute filters (docs/structured-query-spec.md) ----
	// Pick a class → its schema drives field/operator/value inputs; each
	// applied condition is a removable chip; everything lives in the URL.

	const OPS: Record<string, { op: string; label: string }[]> = {
		number: [
			{ op: 'eq', label: '=' },
			{ op: 'gte', label: '≥' },
			{ op: 'lte', label: '≤' }
		],
		date: [
			{ op: 'eq', label: 'on' },
			{ op: 'before', label: 'on/before' },
			{ op: 'after', label: 'on/after' }
		],
		text: [
			{ op: 'contains', label: 'contains' },
			{ op: 'eq', label: 'is' }
		],
		select: [{ op: 'eq', label: 'is' }],
		boolean: [{ op: 'eq', label: 'is' }],
		ref: [{ op: 'eq', label: 'is' }],
		array_ref: [{ op: 'contains', label: 'contains' }]
	};
	const OP_LABEL: Record<string, string> = { eq: 'is', gte: '≥', lte: '≤', before: 'on/before', after: 'on/after', contains: 'contains' };

	let fName = $state('');
	let fOp = $state('eq');
	let fValue = $state('');
	const fDef = $derived(data.classFields.find((f) => f.name === fName) ?? null);
	const fOps = $derived(fDef ? (OPS[fDef.type] ?? []) : []);

	function onFieldChange() {
		fOp = fOps[0]?.op ?? 'eq';
		fValue = '';
	}

	function addAttrFilter() {
		if (!fDef || !fValue) return;
		const key = fOp === 'eq' ? `attr.${fDef.name}` : `attr.${fDef.name}.${fOp}`;
		applyFilter({ [key]: fValue });
		fName = '';
		fValue = '';
	}

	function removeAttrFilter(param: string) {
		applyFilter({ [param]: '' });
	}

	function chipValue(a: (typeof data.attrActive)[number]): string {
		if (a.type === 'ref' || a.type === 'array_ref') {
			return a.values.map((v) => data.refLookup[v]?.tag ?? v.slice(0, 8) + '…').join(', ');
		}
		return a.values.join(', ');
	}

	function clearAll() {
		searchInput = '';
		const patch: Record<string, string> = { search: '', class_code: '', condition_rating: '' };
		for (const a of data.attrActive) patch[a.param] = '';
		applyFilter(patch);
	}

	function toggleSort(col: SortKey) {
		if (data.filters.sort === col) {
			applyFilter({ sort: col, dir: data.filters.dir === 'asc' ? 'desc' : 'asc' });
		} else {
			applyFilter({ sort: col, dir: 'asc' });
		}
	}

	function onSearchSubmit(e: SubmitEvent) {
		e.preventDefault();
		applyFilter({ search: searchInput });
	}

	// Attribute values are per-class, but a few are common enough (location,
	// criticality) that surfacing them in the table when present is useful.
	function attr(row: (typeof data.assets)[number], key: string): unknown {
		const a = row.attributes as Record<string, unknown> | null | undefined;
		return a?.[key];
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold tracking-tight">Assets</h1>
		<div class="flex gap-2">
			<Button href={`/api/assets/export.csv${page.url.search}`} variant="outline">
				<Download class="size-4" /> Export CSV
			</Button>
			<Button href="/assets/import" variant="outline">
				<Upload class="size-4" /> Import
			</Button>
			<Button href="/assets/new"><Plus class="size-4" /> New asset</Button>
		</div>
	</div>

	<form onsubmit={onSearchSubmit} class="flex flex-wrap items-center gap-2">
		<div class="relative">
			<Search class="text-muted-foreground absolute left-2 top-1/2 size-4 -translate-y-1/2" />
			<Input
				type="search"
				placeholder="Contains… (tag, name, any attribute, document) — press Enter"
				bind:value={searchInput}
				class="pl-8 w-72"
			/>
		</div>
		<select
			class="border-input bg-background h-9 rounded-md border px-3 text-sm"
			value={data.filters.classCode}
			onchange={(e) => applyFilter({ class_code: e.currentTarget.value })}
		>
			<option value="">All classes</option>
			{#each data.classCodes as c}
				<option value={c}>{c}</option>
			{/each}
		</select>
		<select
			class="border-input bg-background h-9 rounded-md border px-3 text-sm"
			value={data.filters.conditionRating}
			onchange={(e) => applyFilter({ condition_rating: e.currentTarget.value })}
		>
			<option value="">All conditions</option>
			{#each CONDITION_RATINGS as c}
				<option value={c}>{c}</option>
			{/each}
			<option value="unassessed">Unassessed</option>
		</select>
		<Button type="submit" variant="secondary">Search</Button>
		{#if data.filters.search || data.filters.classCode || data.filters.conditionRating || data.attrActive.length}
			<Button type="button" variant="ghost" onclick={clearAll}>Clear</Button>
		{/if}
	</form>

	{#if data.attrErrors.length > 0}
		<div class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
			Ignored filter{data.attrErrors.length === 1 ? '' : 's'}: {data.attrErrors.join(' · ')}
		</div>
	{/if}

	{#if data.filters.classCode}
		<div class="flex flex-wrap items-center gap-2">
			<ListFilter class="text-muted-foreground size-4" />
			{#each data.attrActive as a (a.param)}
				<span class="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
					<span class="font-medium">{a.label}</span>
					<span class="text-muted-foreground">{OP_LABEL[a.op] ?? a.op}</span>
					<span>{chipValue(a)}</span>
					<button
						type="button"
						class="text-muted-foreground hover:text-destructive"
						onclick={() => removeAttrFilter(a.param)}
						aria-label="Remove filter"
					>
						<X class="size-3" />
					</button>
				</span>
			{/each}

			<div class="flex items-center gap-1.5">
				<select
					class="border-input bg-background h-8 rounded-md border px-2 text-xs"
					bind:value={fName}
					onchange={onFieldChange}
				>
					<option value="">+ Add filter…</option>
					{#each data.classFields as f}
						<option value={f.name}>{f.label}</option>
					{/each}
				</select>
				{#if fDef}
					<select class="border-input bg-background h-8 rounded-md border px-2 text-xs" bind:value={fOp}>
						{#each fOps as o}
							<option value={o.op}>{o.label}</option>
						{/each}
					</select>
					{#if fDef.type === 'select'}
						<select class="border-input bg-background h-8 rounded-md border px-2 text-xs" bind:value={fValue}>
							<option value="">choose…</option>
							{#each fDef.options ?? [] as o}
								<option value={o}>{o}</option>
							{/each}
						</select>
					{:else if fDef.type === 'boolean'}
						<select class="border-input bg-background h-8 rounded-md border px-2 text-xs" bind:value={fValue}>
							<option value="">choose…</option>
							<option value="true">true</option>
							<option value="false">false</option>
						</select>
					{:else if fDef.type === 'ref' || fDef.type === 'array_ref'}
						<div class="w-56">
							<AssetPicker
								value={fValue || null}
								onChange={(id) => (fValue = id ?? '')}
								filter={fDef.asset_class_filter}
								placeholder="Pick asset…"
							/>
						</div>
					{:else}
						<input
							type={fDef.type === 'number' ? 'number' : fDef.type === 'date' ? 'date' : 'text'}
							class="border-input bg-background h-8 w-40 rounded-md border px-2 text-xs"
							bind:value={fValue}
							onkeydown={(e) => e.key === 'Enter' && addAttrFilter()}
						/>
					{/if}
					<Button size="sm" variant="secondary" onclick={addAttrFilter} disabled={!fValue}>
						Add
					</Button>
				{/if}
			</div>
		</div>
	{/if}

	<div class="rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50">
				<tr class="text-left">
					{#each [{ k: 'tag' as SortKey, label: 'Tag' }, { k: 'name' as SortKey, label: 'Name' }, { k: 'class_code' as SortKey, label: 'Class' }] as col}
						<th class="px-3 py-2 font-medium">
							<button
								type="button"
								class="hover:text-foreground flex items-center gap-1"
								onclick={() => toggleSort(col.k)}
							>
								{col.label}
								{#if data.filters.sort === col.k}
									{#if data.filters.dir === 'asc'}
										<ArrowUp class="size-3" />
									{:else}
										<ArrowDown class="size-3" />
									{/if}
								{/if}
							</button>
						</th>
					{/each}
					<th class="px-3 py-2 font-medium">Location</th>
					<th class="px-3 py-2 font-medium">Crit.</th>
					<th class="px-3 py-2 font-medium">Lifecycle</th>
					<th class="px-3 py-2 font-medium">DD</th>
					<th class="px-3 py-2 font-medium" title="Related entities (typed cross-links, both directions)">Links</th>
				</tr>
			</thead>
			<tbody>
				{#each data.assets as a}
					<tr class="border-t hover:bg-muted/40">
						<td class="px-3 py-2 font-mono">
							<a href="/assets/{a.id}" class="hover:underline">{a.tag}</a>
						</td>
						<td class="px-3 py-2">{a.name}</td>
						<td class="px-3 py-2">
							<Badge variant="outline">{a.classCode}</Badge>
						</td>
						<td class="text-muted-foreground px-3 py-2">
							{attr(a, 'location') ?? ''}
						</td>
						<td class="px-3 py-2">{attr(a, 'criticality') ?? ''}</td>
						<td class="px-3 py-2">{attr(a, 'lifecycle_state') ?? ''}</td>
						<td class="px-3 py-2">
							{#if a.latestAssessmentStatus === 'assessed' && a.latestCondition}
								<ConditionBadge rating={a.latestCondition} />
							{:else if a.latestAssessmentStatus === 'pending'}
								<span class="text-muted-foreground text-xs">pending</span>
							{:else if a.latestAssessmentStatus === 'not_in_scope'}
								<span class="text-muted-foreground text-xs">n/a</span>
							{:else}
								<span class="text-muted-foreground text-xs">—</span>
							{/if}
						</td>
						<td class="px-3 py-2">
							{#if a.linkCount > 0}
								<a
									href="/assets/{a.id}"
									class="bg-teal-50 text-teal-900 hover:bg-teal-100 inline-flex items-center gap-1 rounded border border-teal-200 px-1.5 py-0.5 text-xs font-medium"
									title={`${a.linkCount} related ${a.linkCount === 1 ? 'entity' : 'entities'}`}
								>
									{a.linkCount}
								</a>
							{:else}
								<span class="text-muted-foreground text-xs">—</span>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="8" class="text-muted-foreground px-3 py-10 text-center">
							No assets match the current filters.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="text-muted-foreground text-xs">
		{data.assets.length} row{data.assets.length === 1 ? '' : 's'} (capped at 500)
	</p>
</div>
