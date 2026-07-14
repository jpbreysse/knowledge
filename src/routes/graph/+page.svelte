<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import {
		CONDITION_COLORS,
		CONDITION_COLOR_UNASSESSED,
		CONDITION_LABELS,
		type ConditionRating
	} from '$lib/constants';
	import Crosshair from '@lucide/svelte/icons/crosshair';
	import type { Core, ElementDefinition, StylesheetJson } from 'cytoscape';

	type GraphPayload = {
		nodes: {
			data: {
				id: string;
				tag: string;
				name: string;
				class: string;
				criticality: number | null;
				lifecycle: string | null;
				condition: string | null;
				assessment_status: string | null;
			};
		}[];
		edges: { data: { id: string; source: string; target: string; rel_type: string } }[];
	};

	type ColourBy = 'class' | 'condition';

	type LayoutKey = 'dagre' | 'breadthfirst' | 'cose';

	let { data } = $props();

	// Data-driven from the asset_class taxonomy. Falls back to the previous
	// hardcoded values if a class hasn't been backfilled yet.
	const CLASS_FILL: Record<string, string> = data.classColors ?? {};
	const STRUCTURAL = new Set(data.structuralCodes ?? ['SITE', 'AREA', 'SYSTEM']);
	const CLASS_FILL_DEFAULT = '#d4d4d4';

	// Legend: derive from the taxonomy. Show every class that has a colour, in
	// the order returned (family then code, per listAssetClasses).
	const CLASS_LEGEND: { label: string; color: string }[] = Object.entries(CLASS_FILL).map(
		([code, color]) => ({ label: code, color })
	);
	if (CLASS_LEGEND.length === 0) {
		CLASS_LEGEND.push({ label: 'Default', color: CLASS_FILL_DEFAULT });
	} else {
		CLASS_LEGEND.push({ label: 'Other', color: CLASS_FILL_DEFAULT });
	}

	const CONDITION_LEGEND: { label: string; color: string }[] = [
		{ label: CONDITION_LABELS.A, color: CONDITION_COLORS.A },
		{ label: CONDITION_LABELS.B, color: CONDITION_COLORS.B },
		{ label: CONDITION_LABELS.C, color: CONDITION_COLORS.C },
		{ label: CONDITION_LABELS.D, color: CONDITION_COLORS.D },
		{ label: 'Not assessed', color: CONDITION_COLOR_UNASSESSED }
	];

	function conditionFill(n: { data: (k: string) => string | null }): string {
		const c = n.data('condition');
		const status = n.data('assessment_status');
		if (!c || status !== 'assessed') return CONDITION_COLOR_UNASSESSED;
		return CONDITION_COLORS[c as ConditionRating] ?? CONDITION_COLOR_UNASSESSED;
	}

	function classFill(n: { data: (k: string) => string }): string {
		return CLASS_FILL[n.data('class')] ?? CLASS_FILL_DEFAULT;
	}

	const STYLESHEET: StylesheetJson = [
		{
			selector: 'node',
			style: {
				label: 'data(tag)',
				'font-size': 12,
				'text-valign': 'center',
				'text-halign': 'center',
				color: '#1f2d3a',
				'background-color': classFill,
				shape: (n: { data: (k: string) => string }) =>
					STRUCTURAL.has(n.data('class')) ? 'round-rectangle' : 'ellipse',
				width: 'label',
				'min-width': 60,
				height: 36,
				'padding-left': '8px',
				'padding-right': '8px',
				'border-color': '#5b6675',
				'border-width': (n: { data: (k: string) => number | null }) => {
					const c = n.data('criticality');
					if (c == null) return 1;
					if (c >= 4) return 3;
					if (c === 3) return 2;
					return 1;
				},
				opacity: (n: { data: (k: string) => string | null }) => {
					const lc = n.data('lifecycle');
					return lc === 'shutdown' || lc === 'decommissioned' ? 0.5 : 1;
				}
			} as unknown as Record<string, unknown>
		},
		{
			selector: 'node:selected',
			style: { 'border-color': '#e07a3d', 'border-width': 3 }
		},
		{
			selector: 'edge',
			style: {
				'curve-style': 'bezier',
				width: 1.5,
				'line-color': '#8a9199',
				'target-arrow-color': '#8a9199',
				'target-arrow-shape': 'triangle',
				'arrow-scale': 1.2
			}
		},
		// v3.1: typed cross-links render as dashed, distinct colour so the
		// containment tree stays visually dominant.
		{
			selector: 'edge[rel_type = "participates_in"]',
			style: {
				'line-style': 'dashed',
				'line-color': '#4a7c8a',
				'target-arrow-color': '#4a7c8a',
				width: 2
			}
		},
		{
			selector: '.faded',
			style: { opacity: 0.25, 'text-opacity': 0.25 }
		}
	] as unknown as StylesheetJson;

	let canvasEl = $state<HTMLDivElement | null>(null);
	let cy: Core | null = null;
	let payload = $state<GraphPayload | null>(null);
	let status = $state<'loading' | 'ready' | 'empty' | 'error'>('loading');
	let layoutKey = $state<LayoutKey>('dagre');
	let colourBy = $state<ColourBy>('class');

	function applyColourBy(mode: ColourBy) {
		if (!cy) return;
		const paint = mode === 'condition' ? conditionFill : classFill;
		cy.nodes().forEach((n) => {
			n.style('background-color', paint(n as unknown as { data: (k: string) => string }));
		});
	}

	function onColourByChange(e: Event) {
		colourBy = (e.currentTarget as HTMLSelectElement).value as ColourBy;
		applyColourBy(colourBy);
	}

	function layoutOptions(key: LayoutKey) {
		if (key === 'dagre') {
			return { name: 'dagre', rankDir: 'TB', nodeSep: 30, rankSep: 60, animate: false };
		}
		if (key === 'breadthfirst') {
			return { name: 'breadthfirst', directed: true, padding: 20, animate: false };
		}
		return { name: 'cose', padding: 30, animate: false, nodeRepulsion: 4000, idealEdgeLength: 80 };
	}

	function runLayout() {
		if (!cy) return;
		cy.layout(layoutOptions(layoutKey)).run();
	}

	function fitView() {
		cy?.fit(undefined, 50);
	}

	function onLayoutChange(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value as LayoutKey;
		layoutKey = v;
		runLayout();
		fitView();
	}

	onMount(async () => {
		try {
			const res = await fetch('/api/graph');
			if (!res.ok) throw new Error(`status ${res.status}`);
			payload = (await res.json()) as GraphPayload;
		} catch {
			status = 'error';
			return;
		}

		if (!payload || payload.nodes.length === 0) {
			status = 'empty';
			return;
		}

		const [{ default: cytoscape }, { default: dagre }] = await Promise.all([
			import('cytoscape'),
			import('cytoscape-dagre')
		]);
		cytoscape.use(dagre);

		if (!canvasEl) {
			status = 'error';
			return;
		}

		const elements: ElementDefinition[] = [
			...payload.nodes.map((n) => ({ group: 'nodes' as const, data: n.data })),
			...payload.edges.map((e) => ({ group: 'edges' as const, data: e.data }))
		];

		cy = cytoscape({
			container: canvasEl,
			elements,
			style: STYLESHEET,
			layout: layoutOptions(layoutKey),
			wheelSensitivity: 0.2
		});

		cy.on('tap', 'node', (evt) => {
			const id = evt.target.id();
			goto(`/assets/${id}`);
		});

		cy.on('mouseover', 'node', (evt) => {
			const target = evt.target;
			const neighborhood = target.closedNeighborhood();
			cy!.elements().difference(neighborhood).addClass('faded');
		});

		cy.on('mouseout', 'node', () => {
			cy!.elements().removeClass('faded');
		});

		status = 'ready';
		if (colourBy !== 'class') applyColourBy(colourBy);
	});

	onDestroy(() => {
		cy?.destroy();
		cy = null;
	});
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between gap-4">
		<h1 class="text-2xl font-semibold tracking-tight">Asset graph</h1>
		<div class="flex items-center gap-2">
			<label for="cy-colour-by" class="text-muted-foreground text-xs">Colour by</label>
			<select
				id="cy-colour-by"
				class="border-input bg-background h-9 rounded-md border px-2 text-sm"
				value={colourBy}
				onchange={onColourByChange}
				disabled={status !== 'ready'}
			>
				<option value="class">Class</option>
				<option value="condition">Condition</option>
			</select>
			<select
				class="border-input bg-background h-9 rounded-md border px-3 text-sm"
				value={layoutKey}
				onchange={onLayoutChange}
				disabled={status !== 'ready'}
			>
				<option value="dagre">Hierarchical (dagre)</option>
				<option value="breadthfirst">Breadth-first</option>
				<option value="cose">Force-directed (cose)</option>
			</select>
			<Button variant="outline" onclick={fitView} disabled={status !== 'ready'}>
				<Crosshair class="size-4" /> Fit to view
			</Button>
		</div>
	</div>

	<div class="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
		{#each colourBy === 'condition' ? CONDITION_LEGEND : CLASS_LEGEND as l}
			<span class="inline-flex items-center gap-1.5">
				<span
					class="inline-block size-3 rounded-sm border border-[#5b6675]"
					style="background:{l.color}"
				></span>
				{l.label}
			</span>
		{/each}
		<span class="ml-2">·</span>
		<span>Border width = criticality (1px → 3px)</span>
		<span>·</span>
		<span>Faded = shutdown / decommissioned</span>
		<span>·</span>
		<span class="inline-flex items-center gap-1.5">
			<svg width="20" height="6" class="inline-block"><line x1="0" y1="3" x2="20" y2="3" stroke="#8a9199" stroke-width="1.5" /></svg>
			contains
		</span>
		<span class="inline-flex items-center gap-1.5">
			<svg width="20" height="6" class="inline-block"><line x1="0" y1="3" x2="20" y2="3" stroke="#4a7c8a" stroke-width="2" stroke-dasharray="4 3" /></svg>
			participates_in
		</span>
	</div>

	<div class="bg-card relative rounded-md border" style="height: 70vh;">
		{#if status === 'loading'}
			<div class="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
				Loading graph…
			</div>
		{:else if status === 'error'}
			<div class="text-destructive absolute inset-0 grid place-items-center text-sm">
				Could not load graph. Try refreshing.
			</div>
		{:else if status === 'empty'}
			<div class="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
				No assets to display. Add an asset to see the graph.
			</div>
		{/if}
		<div bind:this={canvasEl} class="size-full" class:invisible={status !== 'ready'}></div>
	</div>

	<p class="text-muted-foreground text-xs">
		{payload?.nodes.length ?? 0} nodes, {payload?.edges.length ?? 0} edges
	</p>
</div>
