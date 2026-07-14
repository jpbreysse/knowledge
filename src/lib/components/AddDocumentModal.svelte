<script lang="ts" module>
	export type AddDocConnector = {
		id: string;
		label: string;
		baseUrl: string;
		linkTemplate: string;
	};
	export type DocSearchItem = { id: string; title: string | null };

	/** Render a connector link_template against a doc id + base_url. */
	export function buildExternalUrl(template: string, baseUrl: string, docId: string) {
		const trimmedBase = baseUrl.replace(/\/+$/, '');
		return template.replaceAll('{base_url}', trimmedBase).replaceAll('{id}', docId);
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/components/ui/sonner';
	import X from '@lucide/svelte/icons/x';

	let {
		open = $bindable(false),
		assetId,
		connector
	}: {
		open?: boolean;
		assetId: string;
		connector: AddDocConnector | null;
	} = $props();

	let query = $state('');
	let allItems = $state<DocSearchItem[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let searchInput = $state<HTMLInputElement | null>(null);
	let selectingId = $state<string | null>(null);

	const MAX_VISIBLE = 50;

	const filteredItems = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const matches = q
			? allItems.filter((it) => (it.title ?? 'untitled document').toLowerCase().includes(q))
			: allItems;
		return matches.slice(0, MAX_VISIBLE);
	});

	async function loadAll() {
		if (!connector) return;
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/connectors/${connector.id}/search?q=`);
			if (!res.ok) {
				error = `Search failed (${res.status}).`;
				allItems = [];
				return;
			}
			const j = await res.json();
			allItems = j.items ?? [];
			error = j.error ?? null;
		} catch {
			error = 'Network error.';
			allItems = [];
		} finally {
			loading = false;
		}
	}

	function onQueryInput(e: Event) {
		query = (e.currentTarget as HTMLInputElement).value;
	}

	$effect(() => {
		if (open && connector) {
			query = '';
			allItems = [];
			error = null;
			loadAll();
			tick().then(() => searchInput?.focus());
		}
	});

	function close() {
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	async function pick(item: DocSearchItem) {
		if (!connector) return;
		selectingId = item.id;
		const externalUrl = buildExternalUrl(connector.linkTemplate, connector.baseUrl, item.id);
		const filename = item.title ?? 'Untitled document';
		const res = await fetch(`/api/assets/${assetId}/documents`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ connector_id: connector.id, external_url: externalUrl, filename })
		});
		selectingId = null;
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			const firstErr = j.errors ? Object.values(j.errors)[0] : (j.error ?? 'link failed');
			error = String(firstErr);
			toast.error(String(firstErr));
			return;
		}
		toast.success('Document linked');
		close();
		await invalidateAll();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
		onkeydown={(e) => {
			if (e.key === 'Enter' && e.target === e.currentTarget) close();
		}}
	>
		<div
			class="bg-card flex w-full max-w-xl flex-col rounded-lg border shadow-lg"
			role="dialog"
			aria-modal="true"
			aria-labelledby="add-doc-title"
		>
			<div class="flex items-start justify-between gap-4 p-5 pb-3">
				<div>
					<h2 id="add-doc-title" class="text-lg font-semibold">Add document</h2>
					<p class="text-muted-foreground mt-0.5 text-sm">
						{#if connector}
							Search the {connector.label} by title.
						{:else}
							No connector configured.
						{/if}
					</p>
				</div>
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground -mr-1 -mt-1 rounded p-1"
					aria-label="Close"
					onclick={close}
				>
					<X class="size-5" />
				</button>
			</div>

			<div class="px-5 pb-3">
				<input
					bind:this={searchInput}
					type="search"
					class="border-input bg-background h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
					placeholder="Document title…"
					value={query}
					oninput={onQueryInput}
					disabled={!connector}
				/>
			</div>

			<div class="max-h-[55vh] overflow-y-auto border-t">
				{#if !connector}
					<p class="text-muted-foreground p-6 text-center text-sm">
						No enabled connector.
					</p>
				{:else if loading}
					<p class="text-muted-foreground p-6 text-center text-sm">Loading documents…</p>
				{:else if error && allItems.length === 0}
					<p class="text-destructive p-6 text-center text-sm">{error}</p>
				{:else if filteredItems.length === 0}
					<p class="text-muted-foreground p-6 text-center text-sm">
						{query.trim() ? 'No documents match.' : 'No documents found.'}
					</p>
				{:else}
					<ul class="divide-y">
						{#each filteredItems as item}
							<li>
								<button
									type="button"
									class="hover:bg-muted/50 flex w-full flex-col items-start gap-0.5 px-5 py-3 text-left disabled:opacity-60"
									onclick={() => pick(item)}
									disabled={selectingId !== null}
								>
									<span class="text-sm font-medium">
										{item.title ?? 'Untitled document'}
										{#if selectingId === item.id}
											<span class="text-muted-foreground ml-2 text-xs">linking…</span>
										{/if}
									</span>
									<span class="text-muted-foreground font-mono text-xs">{item.id}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			{#if (error || allItems.length > MAX_VISIBLE) && allItems.length > 0}
				<div class="text-muted-foreground border-t px-5 py-2 text-xs">
					{#if error}
						<span class="text-destructive">{error}</span>
					{:else}
						Showing {filteredItems.length} of {allItems.length}{query.trim() ? ' matches' : ''}.
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
