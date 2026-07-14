<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import List from '@lucide/svelte/icons/list';
	import GitBranch from '@lucide/svelte/icons/git-branch';
	import Network from '@lucide/svelte/icons/network';
	import AlertOctagon from '@lucide/svelte/icons/alert-octagon';
	import Boxes from '@lucide/svelte/icons/boxes';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import CircleDollarSign from '@lucide/svelte/icons/circle-dollar-sign';

	let { data } = $props();

	function fmtUsd(n: number) {
		if (n === 0) return '$0';
		if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
		return `$${n}`;
	}

	const kpis = $derived([
		{ icon: Boxes, label: 'Total assets', value: String(data.stats.totalAssets) },
		{ icon: ClipboardCheck, label: 'Assessed', value: String(data.stats.assessedCount) },
		{ icon: AlertOctagon, label: 'Critical findings', value: String(data.stats.criticalCount) },
		{ icon: CircleDollarSign, label: 'Recommended CapEx', value: fmtUsd(data.stats.capexTotal) }
	]);
</script>

<div class="space-y-8">
	<div class="space-y-2">
		<p class="text-muted-foreground text-xs uppercase tracking-wide">Lummus Due Diligence Portal</p>
		<h1 class="text-3xl font-semibold tracking-tight">Asset Registry</h1>
		<p class="text-muted-foreground max-w-2xl text-sm">
			Browse the assets at your plant, review the findings and recommendations from the
			latest Lummus due-diligence engagement, and download supporting documentation.
		</p>
	</div>

	<section class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each kpis as k}
			<div class="bg-card flex items-start gap-3 rounded-md border p-4">
				<div
					class="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md"
				>
					<k.icon class="size-5" />
				</div>
				<div>
					<p class="text-muted-foreground text-xs uppercase tracking-wide">{k.label}</p>
					<p class="text-2xl font-semibold">{k.value}</p>
				</div>
			</div>
		{/each}
	</section>

	<section class="space-y-3">
		<div class="flex items-baseline justify-between">
			<h2 class="text-sm font-semibold">Top critical findings</h2>
			{#if data.stats.criticalCount > data.topFindings.length}
				<span class="text-muted-foreground text-xs"
					>Showing 3 of {data.stats.criticalCount}</span
				>
			{/if}
		</div>
		{#if data.topFindings.length === 0}
			<p class="bg-muted/30 text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
				No critical findings across the current DD scope. Everything material is B or better.
			</p>
		{:else}
			<ul class="divide-y rounded-md border">
				{#each data.topFindings as f}
					<li class="px-4 py-3">
						<div class="flex items-start gap-3">
							<AlertOctagon class="mt-0.5 size-4 shrink-0 text-red-600" />
							<div class="flex-1">
								<div class="flex items-baseline gap-2">
									<a
										href={`/assets/${f.assetId}`}
										class="font-mono text-sm hover:underline"
									>
										{f.assetTag}
									</a>
									<span class="text-muted-foreground text-xs">{f.assetName}</span>
								</div>
								<p class="mt-0.5 text-sm font-medium">{f.title}</p>
								{#if f.detail}
									<p class="text-muted-foreground mt-0.5 text-xs leading-relaxed">
										{f.detail}
									</p>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="flex flex-wrap gap-3">
		<Button href="/assets"><List class="size-4" /> Browse assets</Button>
		<Button href="/graph" variant="outline"><Network class="size-4" /> Open graph</Button>
		<Button href="/tree" variant="outline"><GitBranch class="size-4" /> Hierarchy tree</Button>
	</section>
</div>
