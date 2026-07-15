<script lang="ts">
	import { page } from '$app/state';
	import { canWrite } from '$lib/auth-client';
	import { goto, invalidateAll } from '$app/navigation';
	import AssetTypeForm, { type AssetTypeFormValue } from '$lib/components/AssetTypeForm.svelte';
	import { fromAssetTypeRow, toAssetTypePayload } from '$lib/asset-type-payload';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from '$lib/components/ui/sonner';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';

	let { data } = $props();

	let value = $state<AssetTypeFormValue>(fromAssetTypeRow(data.klass));
	let errors = $state<Record<string, string>>({});
	let saving = $state(false);

	$effect(() => {
		value = fromAssetTypeRow(data.klass);
	});

	async function save() {
		saving = true;
		errors = {};
		const res = await fetch(`/api/asset-types/${data.klass.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(toAssetTypePayload(value))
		});
		saving = false;
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			errors = j.errors ?? { _root: j.error ?? 'failed to save' };
			toast.error(errors._root ?? 'Could not save changes');
			return;
		}
		toast.success('Saved');
		await invalidateAll();
	}

	async function remove() {
		if (data.usage > 0) {
			toast.error(`Cannot delete — ${data.usage} asset(s) still use ${data.klass.code}.`);
			return;
		}
		if (!confirm(`Delete type "${data.klass.code}"?`)) return;
		const res = await fetch(`/api/asset-types/${data.klass.id}`, { method: 'DELETE' });
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			toast.error(j.error ?? 'Could not delete');
			return;
		}
		toast.success('Deleted');
		goto('/asset-types');
	}
</script>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<a href="/asset-types" class="text-muted-foreground text-sm hover:underline">
				← Back to asset types
			</a>
			<h1 class="mt-2 text-2xl font-semibold tracking-tight">
				<span class="font-mono">{data.klass.code}</span>
			</h1>
			<p class="text-muted-foreground text-sm">
				{data.klass.label} ·
				<span class="text-foreground/80">{data.usage}</span> asset{data.usage === 1 ? '' : 's'} use this type
			</p>
		</div>
		<div class="flex gap-2" class:hidden={!canWrite(page.data.user?.role)}>
			<Button href={`/assets/import?class=${data.klass.code}`} variant="outline">
				<Upload class="size-4" /> Import CSV
			</Button>
			<Button onclick={save} disabled={saving}>
				<Save class="size-4" />
				{saving ? 'Saving…' : 'Save'}
			</Button>
			<Button
				onclick={remove}
				variant="destructive"
				disabled={data.usage > 0}
				title={data.usage > 0 ? `${data.usage} asset(s) still use this type` : 'Delete'}
			>
				<Trash2 class="size-4" /> Delete
			</Button>
			<Button href="/asset-types" variant="ghost">
				<X class="size-4" /> Close
			</Button>
		</div>
	</div>
	<Separator />
	<AssetTypeForm bind:value {errors} codeLocked={data.usage > 0} />
</div>
