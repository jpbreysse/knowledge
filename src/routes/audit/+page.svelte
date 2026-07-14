<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let { data }: { data: PageData } = $props();

	let method = $state(data.filters.method);
	let path = $state(data.filters.path);
	let status = $state(data.filters.status);

	function apply() {
		const params = new URLSearchParams();
		if (method) params.set('method', method);
		if (path) params.set('path', path);
		if (status) params.set('status', status);
		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	function clearFilters() {
		method = '';
		path = '';
		status = '';
		goto('?', { noScroll: true });
	}

	function statusColor(s: number | null) {
		if (!s) return 'text-muted-foreground';
		if (s >= 500) return 'text-red-700';
		if (s >= 400) return 'text-amber-700';
		if (s >= 300) return 'text-blue-700';
		return 'text-emerald-700';
	}

	function pageOffset(delta: number) {
		const params = new URLSearchParams(page.url.searchParams);
		const offset = Math.max(0, data.filters.offset + delta);
		params.set('offset', String(offset));
		goto(`?${params.toString()}`, { noScroll: true });
	}
</script>

<h1 class="text-xl font-semibold tracking-tight mb-4">Audit log</h1>

<div class="rounded-lg border border-border bg-card p-3 mb-4">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			apply();
		}}
		class="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
	>
		<div>
			<Label class="text-xs">Method</Label>
			<select
				bind:value={method}
				class="mt-1 w-full text-sm border border-border rounded px-2 py-1 bg-background"
			>
				<option value="">any</option>
				<option value="GET">GET</option>
				<option value="POST">POST</option>
				<option value="PUT">PUT</option>
				<option value="DELETE">DELETE</option>
			</select>
		</div>
		<div>
			<Label class="text-xs">Path contains</Label>
			<Input bind:value={path} placeholder="/api/findings" class="mt-1" />
		</div>
		<div>
			<Label class="text-xs">Status</Label>
			<Input bind:value={status} placeholder="200" class="mt-1" />
		</div>
		<div class="flex gap-2">
			<Button type="submit" size="sm">Apply</Button>
			<Button type="button" variant="ghost" size="sm" onclick={clearFilters}>Clear</Button>
		</div>
	</form>
</div>

<div class="rounded-lg border border-border bg-card overflow-hidden">
	<table class="w-full text-xs font-mono">
		<thead class="bg-muted/40 border-b border-border">
			<tr class="text-left uppercase tracking-wide text-muted-foreground">
				<th class="px-3 py-2 font-medium">Timestamp</th>
				<th class="px-3 py-2 font-medium">Method</th>
				<th class="px-3 py-2 font-medium">Path</th>
				<th class="px-3 py-2 font-medium text-right">Status</th>
				<th class="px-3 py-2 font-medium text-right">ms</th>
				<th class="px-3 py-2 font-medium">IP</th>
			</tr>
		</thead>
		<tbody>
			{#each data.rows as r (r.id)}
				<tr class="border-b border-border last:border-0">
					<td class="px-3 py-1.5 tabular-nums whitespace-nowrap text-muted-foreground">
						{new Date(r.ts).toISOString().slice(0, 19).replace('T', ' ')}
					</td>
					<td class="px-3 py-1.5">{r.method}</td>
					<td class="px-3 py-1.5 truncate max-w-md">{r.path}</td>
					<td class="px-3 py-1.5 text-right tabular-nums {statusColor(r.status)}">{r.status ?? '—'}</td>
					<td class="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{r.duration_ms ?? ''}</td>
					<td class="px-3 py-1.5 text-muted-foreground">{r.ip ?? ''}</td>
				</tr>
			{:else}
				<tr>
					<td colspan="6" class="px-3 py-8 text-center text-muted-foreground">
						No audit entries.
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
			<Button variant="outline" size="sm" disabled={data.filters.offset === 0} onclick={() => pageOffset(-data.filters.limit)}>
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
