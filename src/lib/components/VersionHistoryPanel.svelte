<script lang="ts">
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import GitCommitVertical from '@lucide/svelte/icons/git-commit-vertical';
	import type { VersionChain } from '$lib/server/assets';

	let { chain }: { chain: VersionChain | null } = $props();

	// Only show the panel if there's at least one neighbour version.
	const hasChain = $derived(
		!!chain && (chain.predecessors.length > 0 || chain.successors.length > 0)
	);
</script>

{#if hasChain && chain}
	<section class="space-y-3">
		<div class="flex items-baseline gap-2">
			<h2 class="text-sm font-semibold">Version history</h2>
			<span class="text-muted-foreground text-xs">
				({chain.predecessors.length + 1 + chain.successors.length})
			</span>
		</div>
		<ul class="divide-y rounded-md border">
			<!-- Successors above (newer first) -->
			{#each chain.successors as s}
				<li>
					<a
						href={`/assets/${s.id}`}
						class="hover:bg-muted/40 flex items-center gap-3 px-4 py-2.5 text-sm"
					>
						<ChevronUp class="text-muted-foreground size-4 shrink-0" />
						<span class="font-mono">{s.tag}</span>
						{#if s.version}
							<span class="text-muted-foreground text-xs">{s.version}</span>
						{/if}
						<span class="text-muted-foreground truncate text-xs">{s.name}</span>
					</a>
				</li>
			{/each}

			<!-- Current -->
			<li class="bg-muted/40 flex items-center gap-3 px-4 py-2.5 text-sm">
				<GitCommitVertical class="text-primary size-4 shrink-0" />
				<span class="font-mono font-semibold">{chain.current.tag}</span>
				{#if chain.current.version}
					<span class="text-muted-foreground text-xs">{chain.current.version}</span>
				{/if}
				<span class="text-muted-foreground truncate text-xs">{chain.current.name}</span>
				<span
					class="bg-primary text-primary-foreground ml-auto rounded px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide"
				>
					current
				</span>
			</li>

			<!-- Predecessors below (oldest first, so newest sits closest to current) -->
			{#each [...chain.predecessors].reverse() as p}
				<li>
					<a
						href={`/assets/${p.id}`}
						class="hover:bg-muted/40 flex items-center gap-3 px-4 py-2.5 text-sm"
					>
						<ChevronUp class="text-muted-foreground size-4 shrink-0 rotate-180" />
						<span class="font-mono">{p.tag}</span>
						{#if p.version}
							<span class="text-muted-foreground text-xs">{p.version}</span>
						{/if}
						<span class="text-muted-foreground truncate text-xs">{p.name}</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}
