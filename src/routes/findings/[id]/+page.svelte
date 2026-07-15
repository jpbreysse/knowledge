<script lang="ts">
	import { page } from '$app/state';
	import { canWrite } from '$lib/auth-client';
	import type { PageData } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { toast } from 'svelte-sonner';
	import AssetSearchModal from '$lib/components/AssetSearchModal.svelte';
	import DocumentSearchModal from '$lib/components/DocumentSearchModal.svelte';
	import { severityClasses, statusClasses, relativeTime } from '$lib/badges';
	import { SEVERITIES, STATUSES, type Severity, type Status } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let editing = $state(false);
	let assetModalOpen = $state(false);
	let docModalOpen = $state(false);
	let descRefreshing = $state(false);
	let creatingDoc = $state(false);

	let title = $state(data.finding.title);
	let severity = $state<Severity>(data.finding.severity);

	$effect(() => {
		title = data.finding.title;
		severity = data.finding.severity;
	});

	const editorUrl = $derived(
		data.finding.description_doc_id && data.docsAppBase
			? `${data.docsAppBase}/?id=${data.finding.description_doc_id}&chrome=minimal`
			: null
	);

	async function save() {
		const res = await fetch(`/api/findings/${data.finding.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title, severity })
		});
		if (!res.ok) {
			toast.error('Failed to save: ' + (await res.text()));
			return;
		}
		toast.success('Saved');
		editing = false;
		await invalidateAll();
	}

	async function createDescriptionDoc() {
		creatingDoc = true;
		try {
			const res = await fetch(`/api/findings/${data.finding.id}/description-doc`, {
				method: 'POST'
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				toast.error(j.error ?? 'Could not create description document');
				return;
			}
			toast.success('Description document ready');
			await invalidateAll();
			editing = true;
		} finally {
			creatingDoc = false;
		}
	}

	async function refreshDescription() {
		descRefreshing = true;
		try {
			const res = await fetch(`/api/findings/${data.finding.id}/description-cache`, {
				method: 'POST'
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				toast.error(j.error ?? 'Refresh failed');
				return;
			}
			toast.success('Description refreshed');
			await invalidateAll();
		} finally {
			descRefreshing = false;
		}
	}

	async function transition(to: Status) {
		const res = await fetch(`/api/findings/${data.finding.id}/transition`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ to_status: to })
		});
		if (!res.ok) {
			toast.error('Transition failed');
			return;
		}
		toast.success(`Marked as ${to}`);
		await invalidateAll();
	}

	async function deleteFinding() {
		if (!confirm('Delete this finding? This cannot be undone.')) return;
		const res = await fetch(`/api/findings/${data.finding.id}`, { method: 'DELETE' });
		if (!res.ok) {
			toast.error('Delete failed');
			return;
		}
		toast.success('Deleted');
		goto('/findings');
	}

	async function linkAssetCallback(asset: {
		id: string;
		tag: string;
		name: string;
		display: string;
	}) {
		assetModalOpen = false;
		const res = await fetch(`/api/findings/${data.finding.id}/assets`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				asset_id: asset.id,
				asset_tag: asset.tag,
				asset_display: asset.display
			})
		});
		if (!res.ok) {
			toast.error('Failed to link asset');
			return;
		}
		toast.success(`Linked ${asset.tag}`);
		await invalidateAll();
	}

	async function unlinkAsset(assetId: string) {
		const res = await fetch(
			`/api/findings/${data.finding.id}/assets/${encodeURIComponent(assetId)}`,
			{ method: 'DELETE' }
		);
		if (!res.ok) {
			toast.error('Unlink failed');
			return;
		}
		toast.success('Unlinked');
		await invalidateAll();
	}

	async function linkDocCallback(doc: { id: string; title: string }) {
		docModalOpen = false;
		const res = await fetch(`/api/findings/${data.finding.id}/documents`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ document_id: doc.id, document_title: doc.title })
		});
		if (!res.ok) {
			toast.error('Failed to link document');
			return;
		}
		toast.success('Linked document');
		await invalidateAll();
	}

	async function unlinkDoc(docId: string) {
		const res = await fetch(
			`/api/findings/${data.finding.id}/documents/${encodeURIComponent(docId)}`,
			{ method: 'DELETE' }
		);
		if (!res.ok) {
			toast.error('Unlink failed');
			return;
		}
		await invalidateAll();
	}

	const lifecycle = $derived([
		{ key: 'raised', label: 'Raised', at: data.finding.raised_at, by: data.finding.raised_by },
		{
			key: 'reviewed',
			label: 'Reviewed',
			at: data.finding.reviewed_at,
			by: data.finding.reviewed_by
		},
		{ key: 'closed', label: 'Closed', at: data.finding.closed_at, by: data.finding.closed_by }
	]);
</script>

<a href="/findings" class="text-xs text-muted-foreground hover:text-foreground">← Back to findings</a>

<div class="mt-2 flex items-start justify-between gap-4 mb-4">
	<div class="flex-1 min-w-0">
		{#if editing}
			<Input bind:value={title} class="text-lg font-semibold" />
		{:else}
			<h1 class="text-xl font-semibold tracking-tight break-words">{data.finding.title}</h1>
		{/if}
		<div class="flex items-center gap-2 mt-2">
			{#if editing}
				<select
					bind:value={severity}
					class="text-xs border border-border rounded px-2 py-0.5 bg-background"
				>
					{#each SEVERITIES as s}
						<option value={s}>{s}</option>
					{/each}
				</select>
			{:else}
				<span class="inline-flex items-center px-1.5 py-0.5 rounded border text-xs {severityClasses[data.finding.severity]}">
					{data.finding.severity}
				</span>
			{/if}
			<span class="inline-flex items-center px-1.5 py-0.5 rounded border text-xs {statusClasses[data.finding.status]}">
				{data.finding.status}
			</span>
			<span class="text-xs text-muted-foreground">{data.finding.finding_type}</span>
		</div>
	</div>

	<div class="flex gap-2" class:hidden={!canWrite(page.data.user?.role)}>
		{#if editing}
			<Button variant="ghost" size="sm" onclick={() => (editing = false)}>Cancel</Button>
			<Button size="sm" onclick={save}>Save</Button>
		{:else}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="sm">Status…</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					{#each STATUSES as s}
						<DropdownMenu.Item
							disabled={s === data.finding.status}
							onSelect={() => transition(s)}
						>
							Mark {s}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			<Button variant="outline" size="sm" onclick={() => (editing = true)}>Edit</Button>
			<Button variant="destructive" size="sm" onclick={deleteFinding}>Delete</Button>
		{/if}
	</div>
</div>

<!-- Lifecycle -->
<div class="rounded-lg border border-border bg-card p-3 mb-4">
	<div class="grid grid-cols-3 gap-3">
		{#each lifecycle as step}
			<div class="text-xs">
				<div class="font-medium uppercase tracking-wide text-muted-foreground">{step.label}</div>
				{#if step.at}
					<div class="mt-1 text-foreground">{relativeTime(step.at)}</div>
					<div class="text-muted-foreground">
						{step.by ?? '—'}
					</div>
				{:else}
					<div class="mt-1 text-muted-foreground">—</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<!-- Description (lives in the document-store) -->
<section class="rounded-lg border border-border bg-card p-4 mb-4">
	<div class="flex items-center justify-between mb-2">
		<div class="flex items-center gap-2">
			<h2 class="text-sm font-semibold">Description</h2>
			{#if data.finding.description_synced_at}
				<span class="text-xs text-muted-foreground">
					synced {relativeTime(data.finding.description_synced_at)}
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if !data.finding.description_doc_id}
				<Button size="sm" onclick={createDescriptionDoc} disabled={creatingDoc}>
					{creatingDoc ? 'Creating…' : 'Create description'}
				</Button>
			{:else if editing}
				<Button
					variant="ghost"
					size="sm"
					onclick={refreshDescription}
					disabled={descRefreshing}
					title="Re-fetch the latest content from the document store"
				>
					{descRefreshing ? 'Refreshing…' : 'Refresh'}
				</Button>
				<Button variant="ghost" size="sm" onclick={() => (editing = false)}>Close editor</Button>
				<Button
					variant="outline"
					size="sm"
					href={editorUrl?.replace('&chrome=minimal', '')}
					target="_blank"
					rel="noopener"
				>
					Open in editor ↗
				</Button>
			{:else}
				<Button
					variant="ghost"
					size="sm"
					onclick={refreshDescription}
					disabled={descRefreshing}
				>
					{descRefreshing ? 'Refreshing…' : 'Refresh'}
				</Button>
				<Button size="sm" onclick={() => (editing = true)}>Edit description</Button>
			{/if}
		</div>
	</div>

	{#if !data.finding.description_doc_id}
		<p class="text-xs text-muted-foreground italic">
			No description document yet — click <em>Create description</em> above to provision one in
			the document store and start writing.
		</p>
	{:else if editing}
		<iframe
			src={editorUrl}
			title="Description editor"
			class="w-full h-[600px] rounded border border-border bg-background"
		></iframe>
		<p class="text-xs text-muted-foreground mt-2">
			Edits autosave to the document store. Click <em>Refresh</em> after saving to update the
			cached preview shown in read mode.
		</p>
	{:else if data.finding.description_html && data.finding.description_html.trim()}
		<div class="prose prose-sm max-w-none">
			{@html data.finding.description_html}
		</div>
	{:else}
		<div class="text-xs text-muted-foreground italic">
			Description is empty.
			<button class="underline" onclick={() => (editing = true)}>Open the editor</button> to add
			content, then refresh to populate this preview.
		</div>
	{/if}
</section>

<!-- Concerns: assets -->
<section class="rounded-lg border border-border bg-card p-4 mb-4">
	<div class="flex items-center justify-between mb-2">
		<h2 class="text-sm font-semibold">
			Concerns
			<span class="text-muted-foreground font-normal text-xs">({data.assets.length})</span>
		</h2>
		{#if canWrite(page.data.user?.role)}<Button variant="outline" size="sm" onclick={() => (assetModalOpen = true)}>+ Add asset</Button>{/if}
	</div>
	{#if data.assets.length === 0}
		<p class="text-xs text-muted-foreground italic">No assets linked.</p>
	{:else}
		<ul class="flex flex-wrap gap-2">
			{#each data.assets as a (a.asset_id)}
				<li class="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-muted/40 text-xs">
					<a href={`/assets/${a.asset_id}`} class="font-medium hover:underline">
						{a.asset_tag ?? a.asset_id}
					</a>
					{#if a.asset_display && a.asset_display !== a.asset_tag}
						<span class="text-muted-foreground truncate max-w-xs">
							{a.asset_display.replace(`${a.asset_tag} — `, '')}
						</span>
					{/if}
					<button
						type="button"
						class="ml-1 text-muted-foreground hover:text-destructive"
						onclick={() => unlinkAsset(a.asset_id)}
						aria-label="Unlink"
						title="Unlink"
					>
						×
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<!-- Supported by: documents -->
<section class="rounded-lg border border-border bg-card p-4 mb-4">
	<div class="flex items-center justify-between mb-2">
		<h2 class="text-sm font-semibold">
			Supported by
			<span class="text-muted-foreground font-normal text-xs">({data.documents.length})</span>
		</h2>
		{#if canWrite(page.data.user?.role)}<Button variant="outline" size="sm" onclick={() => (docModalOpen = true)}>+ Add document</Button>{/if}
	</div>
	{#if data.documents.length === 0}
		<p class="text-xs text-muted-foreground italic">No documents linked.</p>
	{:else}
		<ul class="space-y-1">
			{#each data.documents as d (d.document_id)}
				<li class="flex items-center justify-between gap-2 text-sm">
					<span class="truncate">{d.document_title ?? d.document_id}</span>
					<button
						type="button"
						class="text-xs text-muted-foreground hover:text-destructive"
						onclick={() => unlinkDoc(d.document_id)}
					>
						unlink
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<!-- Audit log -->
<section class="rounded-lg border border-border bg-card p-4">
	<h2 class="text-sm font-semibold mb-2">Activity</h2>
	{#if data.audit.length === 0}
		<p class="text-xs text-muted-foreground italic">No recorded activity.</p>
	{:else}
		<ul class="space-y-1 text-xs font-mono">
			{#each data.audit as a (a.id)}
				<li class="flex items-center gap-2 text-muted-foreground">
					<span class="tabular-nums">{new Date(a.ts).toISOString().slice(0, 19).replace('T', ' ')}</span>
					<span class="px-1 rounded bg-muted text-foreground">{a.method}</span>
					<span class="truncate">{a.path}</span>
					<span class="ml-auto tabular-nums">{a.status}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<AssetSearchModal
	open={assetModalOpen}
	onPick={linkAssetCallback}
	onClose={() => (assetModalOpen = false)}
/>
<DocumentSearchModal
	open={docModalOpen}
	onPick={linkDocCallback}
	onClose={() => (docModalOpen = false)}
/>
