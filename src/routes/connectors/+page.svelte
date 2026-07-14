<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/sonner';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	async function remove(id: string, name: string) {
		if (!confirm(`Delete connector "${name}"? This cannot be undone.`)) return;
		const res = await fetch(`/api/connectors/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			toast.error(j.error ?? 'Could not delete');
			return;
		}
		toast.success('Deleted');
		await invalidateAll();
	}
</script>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight">Connectors</h1>
			<p class="text-muted-foreground text-sm">
				HTTP integrations to other ArborSpace apps and external document stores.
			</p>
		</div>
		<Button href="/connectors/new"><Plus class="size-4" /> New connector</Button>
	</div>

	<div class="rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
				<tr>
					<th class="px-3 py-2 font-medium">Name</th>
					<th class="px-3 py-2 font-medium">Label</th>
					<th class="px-3 py-2 font-medium">Base URL</th>
					<th class="px-3 py-2 font-medium">Path Prefix</th>
					<th class="px-3 py-2 font-medium">Auth</th>
					<th class="px-3 py-2 font-medium">Enabled</th>
					<th class="px-3 py-2 text-right font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.connectors as c}
					<tr class="border-t hover:bg-muted/30">
						<td class="px-3 py-2 font-mono">{c.name}</td>
						<td class="px-3 py-2">{c.label}</td>
						<td class="px-3 py-2 font-mono text-xs">{c.baseUrl}</td>
						<td class="text-muted-foreground px-3 py-2 font-mono text-xs">
							{c.pathPrefix ?? ''}
						</td>
						<td class="text-muted-foreground px-3 py-2 text-xs">{c.authType}</td>
						<td class="px-3 py-2">
							{#if c.enabled}
								<span
									class="inline-block rounded-md border border-green-200 bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900"
								>
									enabled
								</span>
							{:else}
								<span
									class="text-muted-foreground inline-block rounded-md border bg-muted px-2 py-0.5 text-xs font-medium"
								>
									disabled
								</span>
							{/if}
						</td>
						<td class="px-3 py-2 text-right text-sm">
							<a href={`/connectors/${c.id}`} class="hover:underline">Edit</a>
							<span class="text-muted-foreground mx-1">·</span>
							<button
								type="button"
								class="hover:underline"
								onclick={() => remove(c.id, c.name)}
							>
								Delete
							</button>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="7" class="text-muted-foreground px-3 py-10 text-center">
							No connectors yet.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
