<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';
	import { SEVERITIES, type Severity } from '$lib/types';
	import X from '@lucide/svelte/icons/x';

	let title = $state('');
	let severity = $state<Severity>('medium');
	let saving = $state(false);

	// Prefill from the Raise-finding button on /assets/[id]:
	// ?asset_id=…&asset_tag=…&asset_display=…&return_to=/assets/…
	// The asset is pre-linked on save; return_to brings the user straight back.
	const prefillAssetId = page.url.searchParams.get('asset_id');
	const prefillDisplay =
		page.url.searchParams.get('asset_display') ??
		page.url.searchParams.get('asset_tag') ??
		prefillAssetId;
	const returnTo = page.url.searchParams.get('return_to');
	let linkedAssetId = $state(prefillAssetId);

	async function save() {
		if (!title.trim()) {
			toast.error('Title is required');
			return;
		}
		saving = true;
		const id = crypto.randomUUID();
		try {
			const res = await fetch('/api/findings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, title: title.trim(), severity })
			});
			if (!res.ok) {
				toast.error('Save failed: ' + (await res.text()));
				return;
			}
			if (linkedAssetId) {
				const linkRes = await fetch(`/api/findings/${id}/assets`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ asset_id: linkedAssetId })
				});
				if (!linkRes.ok) toast.error('Finding created, but linking the asset failed');
			}
			toast.success('Finding created');
			goto(linkedAssetId && returnTo ? returnTo : `/findings/${id}?edit=1`);
		} finally {
			saving = false;
		}
	}
</script>

<a href={returnTo ?? '/findings'} class="text-xs text-muted-foreground hover:text-foreground">
	← Back to {returnTo ? 'asset' : 'findings'}
</a>

<h1 class="mt-2 text-xl font-semibold tracking-tight mb-4">New finding</h1>

<div class="space-y-4 max-w-3xl">
	{#if linkedAssetId}
		<div>
			<Label class="text-xs">Concerns</Label>
			<div class="mt-1">
				<span class="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-muted/40 text-xs">
					{prefillDisplay}
					<button
						type="button"
						class="ml-1 text-muted-foreground hover:text-destructive"
						onclick={() => (linkedAssetId = null)}
						aria-label="Remove asset link"
						title="Remove asset link"
					>
						<X class="size-3" />
					</button>
				</span>
			</div>
		</div>
	{/if}

	<div>
		<Label for="title" class="text-xs">Title</Label>
		<Input
			id="title"
			bind:value={title}
			placeholder="Short summary of the finding"
			class="mt-1"
		/>
	</div>

	<div>
		<Label for="severity" class="text-xs">Severity</Label>
		<select
			id="severity"
			bind:value={severity}
			class="mt-1 block w-48 text-sm border border-border rounded px-2 py-1 bg-background"
		>
			{#each SEVERITIES as s}
				<option value={s}>{s}</option>
			{/each}
		</select>
	</div>

	<div class="flex gap-2">
		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Create finding'}</Button>
		<Button variant="ghost" href={returnTo ?? '/findings'} disabled={saving}>Cancel</Button>
	</div>

	<p class="text-xs text-muted-foreground">
		{#if linkedAssetId && returnTo}
			On save, the finding is linked to the asset above and you'll be taken straight back to its
			page. Open the finding later to write the description or link documents.
		{:else}
			On save, a description document is created in the document store and you'll be taken to the
			finding's detail page to write the description, link assets, and link supporting documents.
		{/if}
	</p>
</div>
