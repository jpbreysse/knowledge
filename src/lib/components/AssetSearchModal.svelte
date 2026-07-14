<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	interface AssetResult {
		id: string;
		tag: string;
		name: string;
		class_code: string | null;
		display: string;
	}

	interface Props {
		open: boolean;
		onPick: (asset: AssetResult) => void;
		onClose: () => void;
	}

	let { open, onPick, onClose }: Props = $props();

	let q = $state('');
	let results = $state<AssetResult[]>([]);
	let loading = $state(false);
	let errorMsg = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (!open) {
			q = '';
			results = [];
			errorMsg = null;
			return;
		}
	});

	$effect(() => {
		const term = q.trim();
		if (!open) return;
		clearTimeout(timer);
		if (term.length < 1) {
			results = [];
			errorMsg = null;
			loading = false;
			return;
		}
		timer = setTimeout(async () => {
			loading = true;
			errorMsg = null;
			try {
				// The register lives in this app now — direct query, no proxy.
				const res = await fetch(`/api/assets?search=${encodeURIComponent(term)}`);
				const data = await res.json();
				if (!res.ok) {
					errorMsg = (data as { error?: string }).error ?? 'Asset search failed';
					results = [];
				} else {
					results = (data as { id: string; tag: string; name: string; classCode: string | null }[])
						.slice(0, 20)
						.map((r) => ({
							id: r.id,
							tag: r.tag,
							name: r.name,
							class_code: r.classCode,
							display: `${r.tag} — ${r.name}`
						}));
				}
			} catch (e) {
				errorMsg = (e as Error).message;
				results = [];
			} finally {
				loading = false;
			}
		}, 200);
	});

	function pick(a: AssetResult) {
		onPick(a);
	}
</script>

<Dialog.Root {open} onOpenChange={(v) => !v && onClose()}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Add asset</Dialog.Title>
			<Dialog.Description>
				Search the asset registry by tag, name, or class.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-3">
			<Input bind:value={q} placeholder="e.g. P-101" autofocus />

			{#if errorMsg}
				<div class="text-xs px-3 py-2 rounded border border-red-200 bg-red-50 text-red-700">
					{errorMsg}
				</div>
			{/if}

			<div class="max-h-72 overflow-y-auto rounded border border-border">
				{#if loading}
					<div class="p-3 text-xs text-muted-foreground">Searching…</div>
				{:else if results.length === 0 && q.trim()}
					<div class="p-3 text-xs text-muted-foreground">No matches.</div>
				{:else if results.length === 0}
					<div class="p-3 text-xs text-muted-foreground">Type to search.</div>
				{:else}
					<ul class="divide-y divide-border">
						{#each results as a (a.id)}
							<li>
								<button
									type="button"
									class="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
									onclick={() => pick(a)}
								>
									<div class="text-sm font-medium">{a.tag}</div>
									<div class="text-xs text-muted-foreground">
										{a.name}{a.class_code ? ` · ${a.class_code}` : ''}
									</div>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="ghost" onclick={onClose}>Cancel</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
