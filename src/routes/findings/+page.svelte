<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { severityClasses, statusClasses, relativeTime } from '$lib/badges';
	import { SEVERITIES, STATUSES } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let searchInput = $state('');
	$effect(() => {
		searchInput = data.filters.search;
	});

	function setParam(name: string, value: string | string[] | null) {
		const params = new URLSearchParams(page.url.searchParams);
		params.delete(name);
		if (Array.isArray(value)) {
			for (const v of value) params.append(name, v);
		} else if (value !== null && value !== '') {
			params.set(name, value);
		}
		params.delete('offset');
		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	function toggleArr(arr: string[], v: string): string[] {
		return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
	}

	function onSearchSubmit(e: Event) {
		e.preventDefault();
		setParam('search', searchInput);
	}

	function changeSort(field: string) {
		const params = new URLSearchParams(page.url.searchParams);
		const current = params.get('sort');
		if (current === field) {
			params.set('dir', params.get('dir') === 'asc' ? 'desc' : 'asc');
		} else {
			params.set('sort', field);
			params.set('dir', field === 'raised_at' ? 'desc' : 'asc');
		}
		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	function pageOffset(delta: number) {
		const params = new URLSearchParams(page.url.searchParams);
		const offset = Math.max(0, data.filters.offset + delta);
		params.set('offset', String(offset));
		goto(`?${params.toString()}`, { noScroll: true });
	}
</script>

<div class="flex items-center justify-between mb-4">
	<div>
		<h1 class="text-xl font-semibold tracking-tight">Findings</h1>
		<p class="text-xs text-muted-foreground mt-0.5">
			{data.total} total{data.filters.severity.length || data.filters.status.length || data.filters.search ? ' (filtered)' : ''}
		</p>
	</div>
	<div class="flex gap-2">
		<Button variant="outline" size="sm" href="/api/findings/export.csv">Export CSV</Button>
		<Button size="sm" href="/findings/new">New finding</Button>
	</div>
</div>

<div class="rounded-lg border border-border bg-card p-3 mb-4 space-y-3">
	<form onsubmit={onSearchSubmit} class="flex gap-2">
		<Input
			placeholder="Search title or description…"
			bind:value={searchInput}
			class="max-w-md"
		/>
		<Button type="submit" variant="outline" size="sm">Search</Button>
		{#if data.filters.search}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={() => {
					searchInput = '';
					setParam('search', null);
				}}
			>
				Clear
			</Button>
		{/if}
	</form>

	<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
		<div class="flex items-center gap-1.5">
			<span class="text-muted-foreground">Severity:</span>
			{#each SEVERITIES as s}
				{@const active = data.filters.severity.includes(s)}
				<button
					type="button"
					class="px-2 py-0.5 rounded border text-xs transition-opacity
						{severityClasses[s]} {active ? '' : 'opacity-40 hover:opacity-70'}"
					onclick={() => setParam('severity', toggleArr(data.filters.severity, s))}
				>
					{s}
				</button>
			{/each}
		</div>

		<div class="flex items-center gap-1.5">
			<span class="text-muted-foreground">Status:</span>
			{#each STATUSES as s}
				{@const active = data.filters.status.includes(s)}
				<button
					type="button"
					class="px-2 py-0.5 rounded border text-xs transition-opacity
						{statusClasses[s]} {active ? '' : 'opacity-40 hover:opacity-70'}"
					onclick={() => setParam('status', toggleArr(data.filters.status, s))}
				>
					{s}
				</button>
			{/each}
		</div>
	</div>
</div>

<div class="rounded-lg border border-border bg-card overflow-hidden">
	<table class="w-full text-sm">
		<thead class="bg-muted/40 border-b border-border">
			<tr class="text-left text-xs uppercase tracking-wide text-muted-foreground">
				<th class="px-3 py-2 font-medium">
					<button class="hover:text-foreground" onclick={() => changeSort('title')}>Title</button>
				</th>
				<th class="px-3 py-2 font-medium">
					<button class="hover:text-foreground" onclick={() => changeSort('severity')}>Severity</button>
				</th>
				<th class="px-3 py-2 font-medium">
					<button class="hover:text-foreground" onclick={() => changeSort('status')}>Status</button>
				</th>
				<th class="px-3 py-2 font-medium">Type</th>
				<th class="px-3 py-2 font-medium">
					<button class="hover:text-foreground" onclick={() => changeSort('raised_at')}>Raised</button>
				</th>
				<th class="px-3 py-2 font-medium text-right">Assets</th>
				<th class="px-3 py-2 font-medium text-right">Docs</th>
			</tr>
		</thead>
		<tbody>
			{#each data.findings as f (f.id)}
				<tr class="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
					<td class="px-3 py-2">
						<a href="/findings/{f.id}" class="font-medium hover:underline">{f.title}</a>
					</td>
					<td class="px-3 py-2">
						<span class="inline-flex items-center px-1.5 py-0.5 rounded border text-xs {severityClasses[f.severity]}">
							{f.severity}
						</span>
					</td>
					<td class="px-3 py-2">
						<span class="inline-flex items-center px-1.5 py-0.5 rounded border text-xs {statusClasses[f.status]}">
							{f.status}
						</span>
					</td>
					<td class="px-3 py-2 text-muted-foreground">{f.finding_type}</td>
					<td class="px-3 py-2 text-muted-foreground" title={String(f.raised_at)}>
						{relativeTime(f.raised_at)}
					</td>
					<td class="px-3 py-2 text-right text-muted-foreground tabular-nums">{f.asset_count}</td>
					<td class="px-3 py-2 text-right text-muted-foreground tabular-nums">{f.document_count}</td>
				</tr>
			{:else}
				<tr>
					<td colspan="7" class="px-3 py-12 text-center text-sm text-muted-foreground">
						No findings yet. <a href="/findings/new" class="underline">Create one</a>.
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if data.total > data.filters.limit}
	<div class="flex items-center justify-between mt-3 text-xs text-muted-foreground">
		<span>
			{data.filters.offset + 1}–{Math.min(data.filters.offset + data.filters.limit, data.total)} of {data.total}
		</span>
		<div class="flex gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={data.filters.offset === 0}
				onclick={() => pageOffset(-data.filters.limit)}
			>
				Previous
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={data.filters.offset + data.filters.limit >= data.total}
				onclick={() => pageOffset(data.filters.limit)}
			>
				Next
			</Button>
		</div>
	</div>
{/if}
