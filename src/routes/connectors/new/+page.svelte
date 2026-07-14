<script lang="ts">
	import { goto } from '$app/navigation';
	import ConnectorForm, {
		emptyConnectorForm,
		type ConnectorFormValue
	} from '$lib/components/ConnectorForm.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from '$lib/components/ui/sonner';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';

	let value = $state<ConnectorFormValue>(emptyConnectorForm());
	let errors = $state<Record<string, string>>({});
	let saving = $state(false);

	async function save() {
		saving = true;
		errors = {};
		const res = await fetch('/api/connectors', {
			method: 'POST',
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
			toast.error(errors._root ?? 'Could not create connector');
			return;
		}
		const row = await res.json();
		toast.success('Created');
		goto(`/connectors/${row.id}`);
	}
</script>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<a href="/connectors" class="text-muted-foreground text-sm hover:underline">
				← Back to connectors
			</a>
			<h1 class="mt-2 text-2xl font-semibold tracking-tight">New connector</h1>
		</div>
		<div class="flex gap-2">
			<Button onclick={save} disabled={saving}>
				<Save class="size-4" />
				{saving ? 'Saving…' : 'Save'}
			</Button>
			<Button href="/connectors" variant="ghost">
				<X class="size-4" /> Cancel
			</Button>
		</div>
	</div>
	<Separator />
	<ConnectorForm bind:value {errors} />
</div>
