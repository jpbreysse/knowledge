<script lang="ts">
	import FindingBadge from './FindingBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import AlertOctagon from '@lucide/svelte/icons/alert-octagon';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import { relativeTime } from '$lib/time';
	import { page } from '$app/state';
	import { canWrite } from '$lib/auth-client';
	import type { FindingForAsset } from '$lib/server/findings';

	let {
		findings,
		assetId = '',
		assetTag = '',
		assetName = ''
	}: {
		findings: FindingForAsset[];
		assetId?: string;
		assetTag?: string;
		assetName?: string;
	} = $props();

	// Findings live in this app now — internal links, same-tab flow, and the
	// new-finding page pre-links the asset and returns here after save.
	const raiseHref = $derived(
		`/findings/new` +
			`?asset_id=${encodeURIComponent(assetId)}` +
			`&asset_tag=${encodeURIComponent(assetTag)}` +
			`&asset_display=${encodeURIComponent(`${assetTag} — ${assetName}`)}` +
			`&return_to=${encodeURIComponent(`/assets/${assetId}`)}`
	);
</script>

<section class="space-y-3">
	<div class="flex items-center justify-between">
		<div class="flex items-baseline gap-2">
			<h2 class="text-sm font-semibold">Findings</h2>
			<span class="text-muted-foreground text-xs">({findings.length})</span>
		</div>
		{#if assetId && canWrite(page.data.user?.role)}
			<Button href={raiseHref} variant="outline" size="sm">
				<SquarePen class="size-4" /> Raise finding
			</Button>
		{/if}
	</div>

	{#if findings.length === 0}
		<div
			class="bg-muted/30 flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center"
		>
			<AlertOctagon class="text-muted-foreground size-6" />
			<p class="text-muted-foreground text-sm">No findings recorded for this asset.</p>
		</div>
	{:else}
		<ul class="divide-y rounded-md border">
			{#each findings as f}
				<li>
					<a
						href={`/findings/${f.id}`}
						class="hover:bg-muted/40 flex flex-col gap-1.5 px-4 py-3 transition-colors sm:flex-row sm:items-center sm:gap-4"
					>
						<div class="flex items-center gap-2">
							<FindingBadge kind="severity" value={f.severity} />
							<FindingBadge kind="status" value={f.status} />
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{f.title}</p>
							<p class="text-muted-foreground mt-0.5 text-xs">
								{f.finding_type} · raised {relativeTime(f.raised_at)}
							</p>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
