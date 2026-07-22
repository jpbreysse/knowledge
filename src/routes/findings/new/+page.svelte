<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';
	import { SEVERITIES, type Severity } from '$lib/types';
	import X from '@lucide/svelte/icons/x';
	import Info from '@lucide/svelte/icons/info';

	let { data } = $props();

	let title = $state('');
	let severity = $state<Severity>('medium');
	let saving = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	// Domain vocabulary (empty = legacy mode, form identical to pre-vocabulary).
	const hasVocab = $derived(data.types.length > 0);
	let fType = $state('');
	const typeDef = $derived(data.types.find((t) => t.type === fType) ?? null);
	// Extra required fields beyond title — rendered as inputs into attributes.
	const extraFields = $derived(
		(typeDef?.required_fields ?? []).filter((f: string) => f !== 'title')
	);
	let attrValues = $state<Record<string, string>>({});

	function onTypeChange() {
		fieldErrors = {};
		attrValues = {};
		const d = data.types.find((t) => t.type === fType);
		if (d?.default_severity && (SEVERITIES as readonly string[]).includes(d.default_severity)) {
			severity = d.default_severity as Severity;
		}
	}

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
		fieldErrors = {};
		const id = crypto.randomUUID();
		try {
			const body: Record<string, unknown> = { id, title: title.trim(), severity };
			if (fType) {
				body.finding_type = fType;
				const attrs: Record<string, unknown> = {};
				for (const [k, v] of Object.entries(attrValues)) {
					if (v.trim() !== '') attrs[k] = v.trim();
				}
				body.attributes = attrs;
			}
			const res = await fetch('/api/findings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				const issues = (j.issues ?? []) as { path: string; message: string }[];
				if (issues.length) {
					fieldErrors = Object.fromEntries(issues.map((i) => [i.path, i.message]));
					toast.error(issues[0].message + (issues[0].path ? ` (${issues[0].path.replace('attributes.', '')})` : ''));
				} else {
					toast.error('Save failed: ' + (j.error ?? (await res.text())));
				}
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

	{#if hasVocab}
		<div>
			<Label for="ftype" class="text-xs">Type</Label>
			<select
				id="ftype"
				bind:value={fType}
				onchange={onTypeChange}
				class="mt-1 block w-72 text-sm border border-border rounded px-2 py-1 bg-background"
			>
				<option value="">inspection (legacy)</option>
				{#each data.types as t (t.type)}
					<option value={t.type}>{t.type.replaceAll('_', ' ')}</option>
				{/each}
			</select>
			{#if fieldErrors['finding_type']}
				<p class="mt-1 text-xs text-destructive">{fieldErrors['finding_type']}</p>
			{/if}
			{#if typeDef?.guidance}
				<div class="mt-2 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
					<Info class="mt-0.5 size-3.5 shrink-0" />
					<span>{typeDef.guidance}</span>
				</div>
			{/if}
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
		{#if fieldErrors['title']}<p class="mt-1 text-xs text-destructive">{fieldErrors['title']}</p>{/if}
	</div>

	{#each extraFields as f (f)}
		<div>
			<Label for={`rf-${f}`} class="text-xs">{f.replaceAll('_', ' ')} <span class="text-destructive">*</span></Label>
			<textarea
				id={`rf-${f}`}
				bind:value={attrValues[f]}
				rows="3"
				class="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-sm"
			></textarea>
			{#if fieldErrors[`attributes.${f}`]}
				<p class="mt-1 text-xs text-destructive">{fieldErrors[`attributes.${f}`]}</p>
			{/if}
		</div>
	{/each}

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
