<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/sonner';
	import AssetPicker, { type AssetPickerOption } from './AssetPicker.svelte';
	import type { LinkedEdge } from '$lib/server/entity-links';

	let {
		assetId,
		outgoing,
		incoming
	}: {
		assetId: string;
		outgoing: LinkedEdge[];
		incoming: LinkedEdge[];
	} = $props();

	// Vocabulary is small today. Widening this = updating the CHECK constraint
	// on entity_link.relation_type + this array (mirrors ASSET_CLASS_FIELD_TYPES
	// pattern on asset_class).
	const RELATION_TYPES = ['participates_in'] as const;

	// UI state — add flow
	let addOpen = $state(false);
	let addRelation = $state<(typeof RELATION_TYPES)[number]>('participates_in');
	let addTargetId = $state<string | null>(null);
	let saving = $state(false);
	// Local cache so a freshly-picked target renders as a chip immediately.
	let pickedCache = $state(new Map<string, AssetPickerOption>());
	// UI state — delete flow
	let deletingId = $state<string | null>(null);

	const total = $derived(outgoing.length + incoming.length);

	// Small styling map — same soft-teal we already use for the row badges.
	const RELATION_STYLE = 'bg-teal-50 text-teal-900 border-teal-200';

	function closeAdd() {
		addOpen = false;
		addTargetId = null;
	}

	async function submitAdd() {
		if (!addTargetId) {
			toast.error('Pick a target asset first');
			return;
		}
		saving = true;
		const res = await fetch('/api/entity-links', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				source_id: assetId,
				target_id: addTargetId,
				relation_type: addRelation
			})
		});
		saving = false;
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			const msg = j.errors
				? Object.values(j.errors as Record<string, string>)[0]
				: (j.error ?? 'Could not add link');
			toast.error(String(msg));
			return;
		}
		toast.success('Link added');
		closeAdd();
		await invalidateAll();
	}

	async function removeLink(id: string, description: string) {
		if (!confirm(`Delete link "${description}"? This cannot be undone.`)) return;
		deletingId = id;
		const res = await fetch(`/api/entity-links/${id}`, { method: 'DELETE' });
		deletingId = null;
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			toast.error(j.error ?? 'Could not delete link');
			return;
		}
		toast.success('Link removed');
		await invalidateAll();
	}
</script>

<section class="space-y-3">
	<div class="flex items-baseline justify-between gap-4">
		<div class="flex items-baseline gap-2">
			<h2 class="text-sm font-semibold">Related entities</h2>
			<span class="text-muted-foreground text-xs">({total})</span>
		</div>
		<Button
			type="button"
			variant="outline"
			size="sm"
			onclick={() => (addOpen = true)}
		>
			<Plus class="size-4" /> Add link
		</Button>
	</div>

	{#if total === 0 && !addOpen}
		<p class="bg-muted/20 rounded-md border border-dashed p-6 text-center text-muted-foreground text-xs">
			No links yet. Use <span class="font-medium">+ Add link</span> to relate this asset to another.
		</p>
	{/if}

	{#if total > 0}
		<div class="grid gap-3 md:grid-cols-2">
			<!-- Outgoing -->
			<div class="space-y-2">
				<h3 class="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
					Outgoing ({outgoing.length})
				</h3>
				{#if outgoing.length === 0}
					<p class="bg-muted/20 rounded-md border border-dashed p-3 text-muted-foreground text-xs">
						No outgoing links.
					</p>
				{:else}
					<ul class="divide-y rounded-md border">
						{#each outgoing as edge}
							<li class="flex items-center gap-2 px-3 py-2 text-sm">
								<a
									href={edge.target ? `/assets/${edge.target.id}` : '#'}
									class="hover:bg-muted/40 -mx-1 flex flex-1 items-center gap-2 rounded px-1 py-0.5"
								>
									<span
										class="inline-flex items-center rounded border px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide {RELATION_STYLE}"
									>
										{edge.relation_type}
									</span>
									<ArrowRight class="text-muted-foreground size-3.5 shrink-0" />
									<span class="font-mono">{edge.target?.tag ?? '—'}</span>
									<span class="text-muted-foreground truncate text-xs">
										{edge.target?.name ?? ''}
									</span>
									{#if edge.target?.classCode}
										<span class="text-muted-foreground ml-auto shrink-0 text-[0.65rem] uppercase">
											{edge.target.classCode}
										</span>
									{/if}
								</a>
								<button
									type="button"
									class="text-muted-foreground hover:text-destructive shrink-0 rounded p-1 disabled:opacity-40"
									onclick={() =>
										removeLink(
											edge.id,
											`${edge.relation_type} → ${edge.target?.tag ?? edge.id}`
										)}
									disabled={deletingId === edge.id}
									aria-label="Remove link"
								>
									<Trash2 class="size-3.5" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<!-- Incoming -->
			<div class="space-y-2">
				<h3 class="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
					Incoming ({incoming.length})
				</h3>
				{#if incoming.length === 0}
					<p class="bg-muted/20 rounded-md border border-dashed p-3 text-muted-foreground text-xs">
						No incoming links.
					</p>
				{:else}
					<ul class="divide-y rounded-md border">
						{#each incoming as edge}
							<li class="flex items-center gap-2 px-3 py-2 text-sm">
								<a
									href={edge.source ? `/assets/${edge.source.id}` : '#'}
									class="hover:bg-muted/40 -mx-1 flex flex-1 items-center gap-2 rounded px-1 py-0.5"
								>
									<ArrowLeft class="text-muted-foreground size-3.5 shrink-0" />
									<span class="font-mono">{edge.source?.tag ?? '—'}</span>
									<span
										class="inline-flex items-center rounded border px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide {RELATION_STYLE}"
									>
										{edge.relation_type}
									</span>
									<span class="text-muted-foreground truncate text-xs">
										{edge.source?.name ?? ''}
									</span>
									{#if edge.source?.classCode}
										<span class="text-muted-foreground ml-auto shrink-0 text-[0.65rem] uppercase">
											{edge.source.classCode}
										</span>
									{/if}
								</a>
								<button
									type="button"
									class="text-muted-foreground hover:text-destructive shrink-0 rounded p-1 disabled:opacity-40"
									onclick={() =>
										removeLink(
											edge.id,
											`${edge.source?.tag ?? edge.id} ${edge.relation_type} ← (this asset)`
										)}
									disabled={deletingId === edge.id}
									aria-label="Remove link"
								>
									<Trash2 class="size-3.5" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</section>

<!-- Add-link modal -->
{#if addOpen}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeAdd();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') closeAdd();
		}}
	>
		<div
			class="bg-card flex w-full max-w-lg flex-col rounded-lg border shadow-lg"
			role="dialog"
			aria-modal="true"
			aria-labelledby="add-link-title"
		>
			<div class="flex items-start justify-between gap-4 p-5 pb-3">
				<div>
					<h2 id="add-link-title" class="text-lg font-semibold">Add link</h2>
					<p class="text-muted-foreground mt-0.5 text-sm">
						Create a typed relationship from this asset to another.
					</p>
				</div>
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground -mr-1 -mt-1 rounded p-1"
					aria-label="Close"
					onclick={closeAdd}
				>
					<X class="size-5" />
				</button>
			</div>

			<div class="grid gap-3 px-5 pb-4">
				<div class="grid gap-1.5">
					<label for="add-link-rel" class="text-sm font-medium">Relation type</label>
					<select
						id="add-link-rel"
						class="border-input bg-background h-9 rounded-md border px-3 text-sm"
						bind:value={addRelation}
					>
						{#each RELATION_TYPES as r}
							<option value={r}>{r}</option>
						{/each}
					</select>
				</div>
				<div class="grid gap-1.5">
					<label class="text-sm font-medium">Target asset</label>
					<AssetPicker
						value={addTargetId}
						onChange={(id, opt) => {
							if (id === assetId) {
								toast.error("Can't link an asset to itself");
								return;
							}
							if (opt) {
								const next = new Map(pickedCache);
								next.set(opt.id, opt);
								pickedCache = next;
							}
							addTargetId = id;
						}}
						refLookup={pickedCache}
						placeholder="Search by tag or name…"
					/>
				</div>
			</div>

			<div class="flex justify-end gap-2 border-t px-5 py-3">
				<Button variant="ghost" onclick={closeAdd}>Cancel</Button>
				<Button onclick={submitAdd} disabled={saving || !addTargetId}>
					{saving ? 'Adding…' : 'Add link'}
				</Button>
			</div>
		</div>
	</div>
{/if}
