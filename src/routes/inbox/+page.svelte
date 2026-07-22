<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/sonner';
	import { canWrite } from '$lib/auth-client';
	import { severityClasses, relativeTime } from '$lib/badges';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';

	let { data } = $props();

	let expanded = $state<Set<string>>(new Set());
	let rejecting = $state<string | null>(null);
	let reason = $state('');
	let busy = $state(false);

	function toggle(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expanded = next;
	}

	async function accept(id: string) {
		busy = true;
		const res = await fetch(`/api/proposals/${id}/accept`, { method: 'POST' });
		busy = false;
		if (!res.ok) {
			toast.error('Accept failed');
			return;
		}
		toast.success('Accepted — now visible in Findings');
		await invalidateAll();
	}

	async function reject(id: string) {
		busy = true;
		const res = await fetch(`/api/proposals/${id}/reject`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ reason: reason.trim() || null })
		});
		busy = false;
		if (!res.ok) {
			toast.error('Reject failed');
			return;
		}
		toast.success('Rejected — kept as calibration signal');
		rejecting = null;
		reason = '';
		await invalidateAll();
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
			<InboxIcon class="size-6" /> Review inbox
		</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Proposals derived by reasoning rules. Nothing here is a finding yet — a human accepts or
			rejects, and that decision is the record.
		</p>
	</div>

	{#if data.proposals.length === 0}
		<div class="bg-muted/30 flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center">
			<InboxIcon class="text-muted-foreground size-6" />
			<p class="text-muted-foreground text-sm">No pending proposals.</p>
		</div>
	{:else}
		<div class="rounded-md border">
			<table class="w-full text-sm">
				<tbody>
					{#each data.proposals as p (p.id)}
						{@const isOpen = expanded.has(p.id)}
						<tr class="cursor-pointer border-t first:border-t-0" onclick={() => toggle(p.id)}>
							<td class="w-8 px-3 py-3 align-top">
								{#if isOpen}<ChevronDown class="size-4" />{:else}<ChevronRight class="size-4" />{/if}
							</td>
							<td class="px-3 py-3">
								<div class="flex flex-wrap items-center gap-2">
									<span class="inline-flex items-center rounded border px-1.5 py-0.5 text-xs {severityClasses[p.severity as keyof typeof severityClasses] ?? ''}">{p.severity}</span>
									<span class="font-medium">{p.title}</span>
								</div>
								<p class="text-muted-foreground mt-1 text-xs">
									{#if p.asset_tag}
										on <a href={`/assets/${p.asset_id}`} class="font-mono hover:underline" onclick={(e) => e.stopPropagation()}>{p.asset_tag}</a>
										· {p.asset_name}
									{/if}
									· decider: {p.decider_role ?? '—'}
									· {relativeTime(p.raised_at)}
								</p>
								{#if isOpen}
									<div class="bg-muted/40 mt-2 rounded border p-2 text-xs">
										Produced by <span class="font-mono font-semibold">{p.rule_id}</span> v{p.rule_version}
										· lie v{p.domain_version}
										{#if p.trigger_summary}· trigger: {p.trigger_summary}{/if}
									</div>
								{/if}
								{#if rejecting === p.id}
									<div class="mt-2 flex items-center gap-2" onclick={(e) => e.stopPropagation()} role="none">
										<input
											class="border-input bg-background h-8 w-72 rounded-md border px-2 text-xs"
											placeholder="Reason (optional — the calibration signal)"
											bind:value={reason}
										/>
										<Button size="sm" variant="destructive" disabled={busy} onclick={() => reject(p.id)}>Confirm reject</Button>
										<Button size="sm" variant="ghost" onclick={() => (rejecting = null)}>Cancel</Button>
									</div>
								{/if}
							</td>
							<td class="px-3 py-3 text-right align-top whitespace-nowrap">
								{#if canWrite(page.data.user?.role)}
									<Button size="sm" disabled={busy} onclick={(e: MouseEvent) => { e.stopPropagation(); accept(p.id); }}>
										<Check class="size-4" /> Accept
									</Button>
									<Button size="sm" variant="outline" disabled={busy} onclick={(e: MouseEvent) => { e.stopPropagation(); rejecting = p.id; }}>
										<X class="size-4" /> Reject
									</Button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
