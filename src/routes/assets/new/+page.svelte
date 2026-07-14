<script lang="ts">
	import { goto } from '$app/navigation';
	import AssetForm, {
		type AssetFormValue,
		emptyAssetFormValue
	} from '$lib/components/AssetForm.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/sonner';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';

	let { data } = $props();

	let value = $state<AssetFormValue>(emptyAssetFormValue());

	let errors = $state<Record<string, string>>({});
	let saving = $state(false);

	async function save() {
		saving = true;
		errors = {};
		const body = toPayload(value);
		const res = await fetch('/api/assets', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		saving = false;
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			errors = j.errors ?? { _root: j.error ?? 'failed to save' };
			toast.error(errors._root ?? 'Could not create asset');
			return;
		}
		const created = await res.json();
		toast.success(`Created ${created.tag}`);
		goto(`/assets/${created.id}`);
	}

	function toPayload(v: AssetFormValue) {
		const attrs: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(v.attributes)) {
			if (val !== undefined && val !== '') attrs[k] = val;
		}
		return {
			tag: v.tag,
			name: v.name,
			class_code: v.class_code,
			parent_id: v.parent_id || null,
			attributes: attrs,
			content: v.content,
			confidentiality: v.confidentiality || null,
			version: v.version || null,
			supersedes_asset_id: v.supersedes_asset_id || null
		};
	}
</script>

<div class="space-y-6">
	<div>
		<a href="/assets" class="text-muted-foreground text-sm hover:underline">← Back to assets</a>
		<h1 class="mt-2 text-2xl font-semibold tracking-tight">New asset</h1>
	</div>

	<AssetForm bind:value {errors} assetClasses={data.assetClasses} />

	<div class="flex gap-2">
		<Button onclick={save} disabled={saving}>
			<Save class="size-4" />
			{saving ? 'Saving…' : 'Create asset'}
		</Button>
		<Button href="/assets" variant="ghost"><X class="size-4" /> Cancel</Button>
	</div>
</div>
