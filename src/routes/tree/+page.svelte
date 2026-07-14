<script lang="ts">
	import TreeNode from '$lib/components/TreeNode.svelte';

	let { data } = $props();
</script>

<div class="space-y-4">
	<h1 class="text-2xl font-semibold tracking-tight">Asset hierarchy</h1>
	<p class="text-muted-foreground text-sm">
		Parent-child relationships from the <code class="font-mono">parent_id</code> column. Click a node
		to open the asset.
	</p>

	{#if data.roots.length === 0}
		<p class="text-muted-foreground">No assets yet.</p>
	{:else}
		<ul class="rounded-md border p-3">
			{#each data.roots as root}
				<TreeNode node={root} />
			{/each}
		</ul>
	{/if}
</div>
