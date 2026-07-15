<script lang="ts">
	import { page } from '$app/state';
	import { canWrite } from '$lib/auth-client';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/sonner';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();

	async function remove(id: string, code: string, usage: number) {
		if (usage > 0) {
			toast.error(`Cannot delete — ${usage} asset(s) still use ${code}.`);
			return;
		}
		if (!confirm(`Delete type "${code}"? This cannot be undone.`)) return;
		const res = await fetch(`/api/asset-types/${id}`, { method: 'DELETE' });
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
			<h1 class="text-2xl font-semibold tracking-tight">Asset types</h1>
			<p class="text-muted-foreground text-sm">
				Class taxonomy used across the registry. Defines per-type fields, lifecycle states,
				and which side-panels apply.
			</p>
		</div>
		{#if canWrite(page.data.user?.role)}
			<Button href="/asset-types/new"><Plus class="size-4" /> New type</Button>
		{/if}
	</div>

	<div class="rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
				<tr>
					<th class="px-3 py-2 font-medium"></th>
					<th class="px-3 py-2 font-medium">Code</th>
					<th class="px-3 py-2 font-medium">Label</th>
					<th class="px-3 py-2 font-medium">Family</th>
					<th class="px-3 py-2 text-right font-medium">Fields</th>
					<th class="px-3 py-2 text-right font-medium">Assets</th>
					<th class="px-3 py-2 font-medium">Enabled</th>
					<th class="px-3 py-2 text-right font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.classes as c}
					<tr class="border-t hover:bg-muted/30">
						<td class="px-3 py-2">
							<span
								class="inline-block size-4 rounded-sm border border-[#5b6675]"
								style="background:{c.color ?? '#d4d4d4'}"
								title={c.color ?? 'no colour'}
							></span>
						</td>
						<td class="px-3 py-2 font-mono">{c.code}</td>
						<td class="px-3 py-2">{c.label}</td>
						<td class="px-3 py-2 text-xs">
							<span class="bg-muted text-foreground/80 rounded border px-2 py-0.5">
								{c.family}
							</span>
						</td>
						<td class="text-muted-foreground px-3 py-2 text-right text-xs">
							{c.attributeFields.length}
						</td>
						<td class="text-muted-foreground px-3 py-2 text-right text-xs">
							{c.usage}
						</td>
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
							<a href={`/asset-types/${c.id}`} class="hover:underline">Edit</a>
							<span class="text-muted-foreground mx-1">·</span>
							<button
								type="button"
								class="hover:underline disabled:opacity-50"
								onclick={() => remove(c.id, c.code, c.usage)}
								disabled={c.usage > 0}
								title={c.usage > 0 ? `${c.usage} asset(s) still use this type` : 'Delete'}
							>
								Delete
							</button>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="8" class="text-muted-foreground px-3 py-10 text-center">
							No asset types yet.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="text-muted-foreground text-xs">
		The taxonomy is the metadata layer for class codes. Wiring it to drive the asset form,
		graph colours, and tab visibility happens in a follow-up — until then, the existing
		hardcoded constants stay authoritative.
	</p>
</div>
