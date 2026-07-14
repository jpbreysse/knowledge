<script lang="ts">
	import FindingBadge from './FindingBadge.svelte';
	import History from '@lucide/svelte/icons/history';
	import { relativeTime } from '$lib/time';
	import type { PrecedentFinding } from '$lib/server/findings';

	let {
		precedents
	}: {
		precedents: PrecedentFinding[];
	} = $props();
</script>

<section class="space-y-3">
	<div class="flex items-baseline gap-2">
		<h2 class="text-sm font-semibold">Precedents from Group history</h2>
		<span class="text-muted-foreground text-xs">({precedents.length})</span>
	</div>

	{#if precedents.length === 0}
		<div
			class="bg-muted/30 flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center"
		>
			<History class="text-muted-foreground size-6" />
			<p class="text-muted-foreground text-sm">
				No precedents found in Group history for this equipment class.
			</p>
		</div>
	{:else}
		<ul class="divide-y rounded-md border">
			{#each precedents as p}
				<li>
					<a
						href={`/findings/${p.id}`}
						class="hover:bg-muted/40 flex flex-col gap-1.5 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:gap-4"
					>
						<div class="flex items-center gap-2">
							<FindingBadge kind="severity" value={p.severity} />
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{p.title}</p>
							<p class="text-muted-foreground mt-0.5 text-xs">
								<span
									class="bg-muted text-foreground/80 inline-block rounded border px-1.5 py-0.5 font-mono text-[0.7rem]"
									title={`${p.precedent_site_name} (${p.precedent_site_tag}) — ${p.precedent_asset_tag}`}
								>
									{p.precedent_site_name} · {p.precedent_asset_tag}
								</span>
								<span class="ml-1.5">closed {relativeTime(p.closed_at)}</span>
							</p>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
