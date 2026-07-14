<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import Search from '@lucide/svelte/icons/search';
	import Boxes from '@lucide/svelte/icons/boxes';
	import Layers from '@lucide/svelte/icons/layers';
	import Plug from '@lucide/svelte/icons/plug';
	import Command from '@lucide/svelte/icons/command';
	import CornerDownLeft from '@lucide/svelte/icons/corner-down-left';
	import Upload from '@lucide/svelte/icons/upload';
	import Plus from '@lucide/svelte/icons/plus';
	import AlertOctagon from '@lucide/svelte/icons/alert-octagon';
	import FileText from '@lucide/svelte/icons/file-text';

	type SearchHit = {
		kind: 'asset' | 'asset-type' | 'connector' | 'finding' | 'document' | 'action';
		id: string;
		primary: string;
		secondary: string;
		href: string;
	};

	// Static navigation actions — shown on empty query, filtered by substring
	// match as the user types. Navigable exactly like search hits.
	const ACTIONS: (SearchHit & { icon: typeof Upload })[] = [
		{
			kind: 'action',
			id: 'action-new-asset',
			primary: 'New asset',
			secondary: 'Create a single asset via the form',
			href: '/assets/new',
			icon: Plus
		},
		{
			kind: 'action',
			id: 'action-import',
			primary: 'Import assets from CSV',
			secondary: 'Bulk-create assets for one class',
			href: '/assets/import',
			icon: Upload
		}
	];
	type SearchResult = {
		assets: SearchHit[];
		assetTypes: SearchHit[];
		connectors: SearchHit[];
		findings: SearchHit[];
		documents: SearchHit[];
	};

	let open = $state(false);
	let query = $state('');
	let result = $state<SearchResult>({ assets: [], assetTypes: [], connectors: [], findings: [], documents: [] });
	let loading = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listboxEl = $state<HTMLDivElement | null>(null);
	let activeIdx = $state(0);

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let searchToken = 0;

	const matchedActions = $derived(
		query.trim()
			? ACTIONS.filter((a) => a.primary.toLowerCase().includes(query.trim().toLowerCase()))
			: ACTIONS
	);

	// Flatten sections into a single navigable list — arrow keys walk this,
	// Enter navigates whichever is highlighted.
	const flat = $derived<SearchHit[]>([
		...matchedActions,
		...result.assets,
		...result.assetTypes,
		...result.connectors,
		...result.findings,
		...result.documents
	]);

	async function runSearch(q: string) {
		if (!q.trim()) {
			result = { assets: [], assetTypes: [], connectors: [], findings: [], documents: [] };
			return;
		}
		const myToken = ++searchToken;
		loading = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			if (myToken !== searchToken) return;
			if (res.ok) {
				result = await res.json();
			} else {
				result = { assets: [], assetTypes: [], connectors: [], findings: [], documents: [] };
			}
		} finally {
			if (myToken === searchToken) {
				loading = false;
				activeIdx = 0;
			}
		}
	}

	function onQueryInput(e: Event) {
		query = (e.currentTarget as HTMLInputElement).value;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => runSearch(query), 150);
	}

	async function openPalette() {
		open = true;
		query = '';
		result = { assets: [], assetTypes: [], connectors: [], findings: [], documents: [] };
		activeIdx = 0;
		await tick();
		inputEl?.focus();
	}

	function closePalette() {
		open = false;
	}

	function pick(hit: SearchHit) {
		closePalette();
		goto(hit.href);
	}

	function scrollActiveIntoView() {
		if (!listboxEl) return;
		const btn = listboxEl.querySelector<HTMLButtonElement>(
			`[data-hit-index="${activeIdx}"]`
		);
		btn?.scrollIntoView({ block: 'nearest' });
	}

	function onKeydown(e: KeyboardEvent) {
		// Global open shortcut — Cmd-K on macOS, Ctrl-K elsewhere.
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			open ? closePalette() : openPalette();
			return;
		}
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			closePalette();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (flat.length > 0) {
				activeIdx = (activeIdx + 1) % flat.length;
				tick().then(scrollActiveIntoView);
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (flat.length > 0) {
				activeIdx = (activeIdx - 1 + flat.length) % flat.length;
				tick().then(scrollActiveIntoView);
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const hit = flat[activeIdx];
			if (hit) pick(hit);
		}
	}

	function iconFor(kind: SearchHit['kind']) {
		if (kind === 'asset') return Boxes;
		if (kind === 'asset-type') return Layers;
		if (kind === 'finding') return AlertOctagon;
		if (kind === 'document') return FileText;
		return Plug;
	}

	const searchCount = $derived(
		result.assets.length +
			result.assetTypes.length +
			result.connectors.length +
			result.findings.length +
			result.documents.length
	);

	function sectionOffset(
		section: 'assets' | 'assetTypes' | 'connectors' | 'findings' | 'documents'
	) {
		let n = matchedActions.length;
		if (section === 'assets') return n;
		n += result.assets.length;
		if (section === 'assetTypes') return n;
		n += result.assetTypes.length;
		if (section === 'connectors') return n;
		n += result.connectors.length;
		if (section === 'findings') return n;
		return n + result.findings.length;
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-24"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) closePalette();
		}}
		onkeydown={(e) => {
			if (e.key === 'Enter' && e.target === e.currentTarget) closePalette();
		}}
	>
		<div
			class="bg-card flex w-full max-w-xl flex-col overflow-hidden rounded-lg border shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Search"
		>
			<div class="flex items-center gap-2 border-b px-3 py-2.5">
				<Search class="text-muted-foreground size-4 shrink-0" />
				<input
					bind:this={inputEl}
					type="search"
					class="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
					placeholder="Search assets, findings, documents, types…"
					value={query}
					oninput={onQueryInput}
				/>
				<kbd class="text-muted-foreground hidden rounded border px-1.5 py-0.5 text-[0.65rem] sm:inline">
					esc
				</kbd>
			</div>

			<div bind:this={listboxEl} class="max-h-[55vh] overflow-y-auto">
				{#if matchedActions.length > 0}
					<div class="py-1">
						<p class="text-muted-foreground px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide">
							Actions
						</p>
						{#each matchedActions as hit, i (hit.id)}
							{@const active = i === activeIdx}
							{@const Icon = hit.icon}
							<button
								type="button"
								data-hit-index={i}
								class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm {active
									? 'bg-muted'
									: 'hover:bg-muted/50'}"
								onmouseenter={() => (activeIdx = i)}
								onclick={() => pick(hit)}
							>
								<Icon class="text-muted-foreground size-4 shrink-0" />
								<span class="text-xs">{hit.primary}</span>
								<span class="text-muted-foreground truncate text-xs">{hit.secondary}</span>
								{#if active}
									<CornerDownLeft class="text-muted-foreground ml-auto size-3.5 shrink-0" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
				{#if !query.trim()}
					<p class="text-muted-foreground border-t p-4 text-center text-xs">
						Type to search across assets, findings, documents, asset types, and connectors.
					</p>
				{:else if loading && searchCount === 0}
					<p class="text-muted-foreground p-6 text-center text-sm">Searching…</p>
				{:else if flat.length === 0}
					<p class="text-muted-foreground p-6 text-center text-sm">
						No matches for <span class="font-mono">{query}</span>.
					</p>
				{:else if searchCount > 0}
					{#if result.assets.length > 0}
						<div class="py-1 {matchedActions.length > 0 ? 'border-t' : ''}">
							<p class="text-muted-foreground px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide">
								Assets
							</p>
							{#each result.assets as hit, i (hit.id)}
								{@const idx = sectionOffset('assets') + i}
								{@const active = idx === activeIdx}
								{@const Icon = iconFor(hit.kind)}
								<button
									type="button"
									data-hit-index={idx}
									class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm {active
										? 'bg-muted'
										: 'hover:bg-muted/50'}"
									onmouseenter={() => (activeIdx = idx)}
									onclick={() => pick(hit)}
								>
									<Icon class="text-muted-foreground size-4 shrink-0" />
									<span class="font-mono text-xs">{hit.primary}</span>
									<span class="text-muted-foreground truncate text-xs">{hit.secondary}</span>
									{#if active}
										<CornerDownLeft class="text-muted-foreground ml-auto size-3.5 shrink-0" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
					{#if result.assetTypes.length > 0}
						<div class="border-t py-1">
							<p class="text-muted-foreground px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide">
								Asset types
							</p>
							{#each result.assetTypes as hit, i (hit.id)}
								{@const idx = sectionOffset('assetTypes') + i}
								{@const active = idx === activeIdx}
								{@const Icon = iconFor(hit.kind)}
								<button
									type="button"
									data-hit-index={idx}
									class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm {active
										? 'bg-muted'
										: 'hover:bg-muted/50'}"
									onmouseenter={() => (activeIdx = idx)}
									onclick={() => pick(hit)}
								>
									<Icon class="text-muted-foreground size-4 shrink-0" />
									<span class="font-mono text-xs">{hit.primary}</span>
									<span class="text-muted-foreground truncate text-xs">{hit.secondary}</span>
									{#if active}
										<CornerDownLeft class="text-muted-foreground ml-auto size-3.5 shrink-0" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
					{#if result.connectors.length > 0}
						<div class="border-t py-1">
							<p class="text-muted-foreground px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide">
								Connectors
							</p>
							{#each result.connectors as hit, i (hit.id)}
								{@const idx = sectionOffset('connectors') + i}
								{@const active = idx === activeIdx}
								{@const Icon = iconFor(hit.kind)}
								<button
									type="button"
									data-hit-index={idx}
									class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm {active
										? 'bg-muted'
										: 'hover:bg-muted/50'}"
									onmouseenter={() => (activeIdx = idx)}
									onclick={() => pick(hit)}
								>
									<Icon class="text-muted-foreground size-4 shrink-0" />
									<span class="font-mono text-xs">{hit.primary}</span>
									<span class="text-muted-foreground truncate text-xs">{hit.secondary}</span>
									{#if active}
										<CornerDownLeft class="text-muted-foreground ml-auto size-3.5 shrink-0" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
					{#if result.findings.length > 0}
						<div class="border-t py-1">
							<p class="text-muted-foreground px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide">
								Findings
							</p>
							{#each result.findings as hit, i (hit.id)}
								{@const idx = sectionOffset('findings') + i}
								{@const active = idx === activeIdx}
								{@const Icon = iconFor(hit.kind)}
								<button
									type="button"
									data-hit-index={idx}
									class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm {active
										? 'bg-muted'
										: 'hover:bg-muted/50'}"
									onmouseenter={() => (activeIdx = idx)}
									onclick={() => pick(hit)}
								>
									<Icon class="text-muted-foreground size-4 shrink-0" />
									<span class="truncate text-xs">{hit.primary}</span>
									<span class="text-muted-foreground truncate text-xs">{hit.secondary}</span>
									{#if active}
										<CornerDownLeft class="text-muted-foreground ml-auto size-3.5 shrink-0" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
					{#if result.documents.length > 0}
						<div class="border-t py-1">
							<p class="text-muted-foreground px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide">
								Documents
							</p>
							{#each result.documents as hit, i (hit.id)}
								{@const idx = sectionOffset('documents') + i}
								{@const active = idx === activeIdx}
								{@const Icon = iconFor(hit.kind)}
								<button
									type="button"
									data-hit-index={idx}
									class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm {active
										? 'bg-muted'
										: 'hover:bg-muted/50'}"
									onmouseenter={() => (activeIdx = idx)}
									onclick={() => pick(hit)}
								>
									<Icon class="text-muted-foreground size-4 shrink-0" />
									<span class="truncate text-xs">{hit.primary}</span>
									<span class="text-muted-foreground truncate text-xs">{hit.secondary}</span>
									{#if active}
										<CornerDownLeft class="text-muted-foreground ml-auto size-3.5 shrink-0" />
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			</div>

			<div class="text-muted-foreground border-t bg-muted/30 flex items-center justify-between px-3 py-1.5 text-[0.65rem]">
				<span class="inline-flex items-center gap-2">
					<kbd class="rounded border bg-background px-1 py-0.5">↑</kbd>
					<kbd class="rounded border bg-background px-1 py-0.5">↓</kbd>
					navigate
				</span>
				<span class="inline-flex items-center gap-2">
					<kbd class="rounded border bg-background px-1 py-0.5">↵</kbd>
					open
				</span>
				<span class="inline-flex items-center gap-1">
					<Command class="size-3" /> K to toggle
				</span>
			</div>
		</div>
	</div>
{/if}
