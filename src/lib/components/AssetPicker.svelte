<script lang="ts" module>
	export type AssetPickerOption = {
		id: string;
		tag: string;
		name: string;
		classCode: string;
	};
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import Search from '@lucide/svelte/icons/search';

	let {
		value,
		onChange,
		filter,
		refLookup,
		disabled = false,
		placeholder = 'Search by tag or name…'
	}: {
		value: string | null;
		/** Called when the user picks or clears. When picking, `option` is the
		 *  full row so the caller can cache it for chip display. */
		onChange: (id: string | null, option?: AssetPickerOption) => void;
		filter?: string | string[];
		refLookup?: Map<string, AssetPickerOption>;
		disabled?: boolean;
		placeholder?: string;
	} = $props();

	let query = $state('');
	let results = $state<AssetPickerOption[]>([]);
	let open = $state(false);
	let loading = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let searchToken = 0;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Local cache of options the user picked during this session — covers the
	// new-asset flow where refLookup hasn't seen them yet.
	let recentlyPicked = $state(new Map<string, AssetPickerOption>());

	// Selected chip display — prefer refLookup, then recently picked, then a
	// placeholder while we resolve.
	const selected = $derived.by<AssetPickerOption | null>(() => {
		if (!value) return null;
		const looked = refLookup?.get(value) ?? recentlyPicked.get(value);
		if (looked) return looked;
		return { id: value, tag: value.slice(0, 8) + '…', name: '(loading)', classCode: '' };
	});

	const filterCodes = $derived.by<string[]>(() => {
		if (!filter) return [];
		return Array.isArray(filter) ? filter : [filter];
	});

	async function runSearch(q: string) {
		const myToken = ++searchToken;
		loading = true;
		try {
			const params = new URLSearchParams();
			if (q) params.set('search', q);
			// Server supports a single class_code filter — when we have multiple
			// allowed classes, fetch unfiltered and apply on the client.
			if (filterCodes.length === 1) params.set('class_code', filterCodes[0]);
			const res = await fetch(`/api/assets?${params.toString()}`);
			if (myToken !== searchToken) return;
			if (!res.ok) {
				results = [];
				return;
			}
			const rows = (await res.json()) as AssetPickerOption[];
			if (myToken !== searchToken) return;
			let filtered = rows;
			if (filterCodes.length > 1)
				filtered = rows.filter((r) => filterCodes.includes(r.classCode));
			results = filtered.slice(0, 20);
		} catch {
			if (myToken === searchToken) results = [];
		} finally {
			if (myToken === searchToken) loading = false;
		}
	}

	function onFocus() {
		open = true;
		if (results.length === 0) runSearch(query);
	}

	function onInput(e: Event) {
		query = (e.currentTarget as HTMLInputElement).value;
		open = true;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => runSearch(query), 200);
	}

	function pick(o: AssetPickerOption) {
		// Cache for chip display before refLookup catches up.
		const next = new Map(recentlyPicked);
		next.set(o.id, o);
		recentlyPicked = next;
		onChange(o.id, o);
		query = '';
		open = false;
	}

	function clear() {
		onChange(null);
		query = '';
		tick().then(() => inputEl?.focus());
	}

	function onBlur() {
		// delay closing so an option click still registers
		setTimeout(() => (open = false), 120);
	}
</script>

<div class="relative">
	{#if selected}
		<div class="border-input bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-1.5">
			<a
				href={`/assets/${selected.id}`}
				class="flex min-w-0 flex-1 items-baseline gap-2 hover:underline"
			>
				<span class="font-mono text-sm">{selected.tag}</span>
				<span class="text-muted-foreground truncate text-xs">{selected.name}</span>
				{#if selected.classCode}
					<span class="text-muted-foreground hidden text-[0.65rem] uppercase sm:inline">
						{selected.classCode}
					</span>
				{/if}
			</a>
			{#if !disabled}
				<button
					type="button"
					class="text-muted-foreground hover:text-destructive shrink-0 rounded p-1"
					onclick={clear}
					aria-label="Clear"
				>
					<X class="size-3.5" />
				</button>
			{/if}
		</div>
	{:else}
		<div class="relative">
			<Search class="text-muted-foreground absolute left-2 top-1/2 size-4 -translate-y-1/2" />
			<input
				bind:this={inputEl}
				type="search"
				class="border-input bg-background h-9 w-full rounded-md border pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				{placeholder}
				value={query}
				oninput={onInput}
				onfocus={onFocus}
				onblur={onBlur}
				{disabled}
			/>
		</div>

		{#if open && !disabled}
			<div
				class="bg-popover absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border shadow-lg"
			>
				{#if loading && results.length === 0}
					<p class="text-muted-foreground px-3 py-3 text-xs">Searching…</p>
				{:else if results.length === 0}
					<p class="text-muted-foreground px-3 py-3 text-xs">
						No matches{filterCodes.length > 0 ? ` (class: ${filterCodes.join(', ')})` : ''}.
					</p>
				{:else}
					<ul class="divide-y">
						{#each results as r}
							<li>
								<button
									type="button"
									class="hover:bg-muted/50 flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left"
									onmousedown={(e) => e.preventDefault()}
									onclick={() => pick(r)}
								>
									<div class="flex w-full items-baseline gap-2">
										<span class="font-mono text-sm">{r.tag}</span>
										<span class="text-muted-foreground truncate text-xs">{r.name}</span>
									</div>
									<span class="text-muted-foreground text-[0.65rem] uppercase">
										{r.classCode}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	{/if}
</div>
