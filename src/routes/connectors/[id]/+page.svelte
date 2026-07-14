<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ConnectorForm, { type ConnectorFormValue } from '$lib/components/ConnectorForm.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from '$lib/components/ui/sonner';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	let { data } = $props();

	function toForm(c: typeof data.connector): ConnectorFormValue {
		return {
			name: c.name,
			label: c.label,
			base_url: c.baseUrl,
			path_prefix: c.pathPrefix ?? '',
			auth_type: 'none',
			enabled: c.enabled,
			link_template: c.linkTemplate
		};
	}

	let value = $state<ConnectorFormValue>(toForm(data.connector));
	let errors = $state<Record<string, string>>({});
	let saving = $state(false);

	$effect(() => {
		value = toForm(data.connector);
	});

	async function save() {
		saving = true;
		errors = {};
		const res = await fetch(`/api/connectors/${data.connector.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: value.name,
				label: value.label,
				base_url: value.base_url,
				path_prefix: value.path_prefix || null,
				auth_type: value.auth_type,
				enabled: value.enabled,
				link_template: value.link_template
			})
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
		if (!confirm(`Delete connector "${data.connector.name}"?`)) return;
		const res = await fetch(`/api/connectors/${data.connector.id}`, { method: 'DELETE' });
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			toast.error(j.error ?? 'Could not delete');
			return;
		}
		toast.success('Deleted');
		goto('/connectors');
	}
</script>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<a href="/connectors" class="text-muted-foreground text-sm hover:underline">
				← Back to connectors
			</a>
			<h1 class="mt-2 text-2xl font-semibold tracking-tight">
				<span class="font-mono">{data.connector.name}</span>
			</h1>
			<p class="text-muted-foreground text-sm">{data.connector.label}</p>
		</div>
		<div class="flex gap-2">
			<Button onclick={save} disabled={saving}>
				<Save class="size-4" />
				{saving ? 'Saving…' : 'Save'}
			</Button>
			<Button onclick={remove} variant="destructive">
				<Trash2 class="size-4" /> Delete
			</Button>
			<Button href="/connectors" variant="ghost">
				<X class="size-4" /> Close
			</Button>
		</div>
	</div>
	<Separator />
	<ConnectorForm bind:value {errors} />
</div>
