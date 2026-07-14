<script lang="ts">
	import { goto } from '$app/navigation';
	import AssetTypeForm, {
		emptyAssetTypeForm,
		type AssetTypeFormValue
	} from '$lib/components/AssetTypeForm.svelte';
	import { toAssetTypePayload } from '$lib/asset-type-payload';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from '$lib/components/ui/sonner';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';

	let value = $state<AssetTypeFormValue>(emptyAssetTypeForm());
	let errors = $state<Record<string, string>>({});
	let saving = $state(false);

	async function save() {
		saving = true;
		errors = {};
		const res = await fetch('/api/asset-types', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(toAssetTypePayload(value))
		});
		saving = false;
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			errors = j.errors ?? { _root: j.error ?? 'failed to save' };
			toast.error(errors._root ?? 'Could not create asset type');
			return;
		}
		const row = await res.json();
		toast.success('Created');
		goto(`/asset-types/${row.id}`);
	}
</script>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<a href="/asset-types" class="text-muted-foreground text-sm hover:underline">
				← Back to asset types
			</a>
			<h1 class="mt-2 text-2xl font-semibold tracking-tight">New asset type</h1>
		</div>
		<div class="flex gap-2">
			<Button onclick={save} disabled={saving}>
				<Save class="size-4" />
				{saving ? 'Saving…' : 'Save'}
			</Button>
			<Button href="/asset-types" variant="ghost">
				<X class="size-4" /> Cancel
			</Button>
		</div>
	</div>
	<Separator />
	<AssetTypeForm bind:value {errors} />
</div>
