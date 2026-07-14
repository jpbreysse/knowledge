<script lang="ts" module>
	export type AssetTreeNode = {
		id: string;
		tag: string;
		name: string;
		classCode: string;
		children: AssetTreeNode[];
	};
</script>

<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Self from './TreeNode.svelte';

	let { node, depth = 0 }: { node: AssetTreeNode; depth?: number } = $props();
	let open = $state(depth < 2);
</script>

<li class="py-0.5">
	<div class="flex items-center gap-1">
		{#if node.children.length > 0}
			<button
				type="button"
				class="hover:bg-accent flex size-5 items-center justify-center rounded"
				onclick={() => (open = !open)}
				aria-label={open ? 'Collapse' : 'Expand'}
			>
				{#if open}
					<ChevronDown class="size-3.5" />
				{:else}
					<ChevronRight class="size-3.5" />
				{/if}
			</button>
		{:else}
			<span class="inline-block size-5"></span>
		{/if}
		<a
			href="/assets/{node.id}"
			class="hover:bg-accent flex items-baseline gap-2 rounded px-2 py-0.5 text-sm"
		>
			<span class="font-mono">{node.tag}</span>
			<span class="text-muted-foreground">{node.name}</span>
			<span class="text-muted-foreground text-xs">[{node.classCode}]</span>
		</a>
	</div>
	{#if node.children.length > 0 && open}
		<ul class="border-border ml-5 border-l pl-2">
			{#each node.children as child}
				<Self node={child} depth={depth + 1} />
			{/each}
		</ul>
	{/if}
</li>
