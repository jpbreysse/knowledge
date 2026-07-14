<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import ConditionBadge from '$lib/components/ConditionBadge.svelte';
	import { CONDITION_RATINGS } from '$lib/constants';
	import Plus from '@lucide/svelte/icons/plus';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';
	import Search from '@lucide/svelte/icons/search';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';

	let { data } = $props();

	let searchInput = $state(data.filters.search);

	// v3.1: sort is limited to columns still on `asset`. Criticality/lifecycle
	// filters removed because those values live in each class's attribute schema
	// now; a per-class filter UI is a v3.2 follow-up.
	type SortKey = 'tag' | 'name' | 'class_code';

	function applyFilter(patch: Record<string, string>) {
		const url = new URL(page.url);
		for (const [k, v] of Object.entries(patch)) {
			if (v === '' || v === null) url.searchParams.delete(k);
			else url.searchParams.set(k, v);
		}
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
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
			<Button href="/api/assets/export.csv" variant="outline">
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
		{#if data.filters.search || data.filters.classCode || data.filters.conditionRating}
			<Button
				type="button"
				variant="ghost"
				onclick={() => {
					searchInput = '';
					applyFilter({ search: '', class_code: '', condition_rating: '' });
				}}
			>
				Clear
			</Button>
		{/if}
	</form>

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
