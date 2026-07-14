<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	interface DocumentResult {
		id: string;
		title: string;
	}

	interface Props {
		open: boolean;
		onPick: (doc: DocumentResult) => void;
		onClose: () => void;
	}

	let { open, onPick, onClose }: Props = $props();

	let q = $state('');
	let results = $state<DocumentResult[]>([]);
	let loading = $state(false);
	let errorMsg = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (!open) {
			q = '';
			results = [];
			errorMsg = null;
		}
	});

	$effect(() => {
		const term = q;
		if (!open) return;
		clearTimeout(timer);
		timer = setTimeout(async () => {
			loading = true;
			errorMsg = null;
			try {
				const res = await fetch(`/api/proxy/documents/search?q=${encodeURIComponent(term)}`);
				const data = await res.json();
				if (!res.ok) {
					errorMsg = data.error ?? 'Document store unavailable';
					results = [];
				} else {
					results = data.results ?? [];
				}
			} catch (e) {
				errorMsg = (e as Error).message;
				results = [];
			} finally {
				loading = false;
			}
		}, 200);
	});
</script>

<Dialog.Root {open} onOpenChange={(v) => !v && onClose()}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Add document</Dialog.Title>
			<Dialog.Description>
				Search the document store by title.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-3">
			<Input bind:value={q} placeholder="Document title…" autofocus />

			{#if errorMsg}
				<div class="text-xs px-3 py-2 rounded border border-red-200 bg-red-50 text-red-700">
					{errorMsg}
				</div>
			{/if}

			<div class="max-h-72 overflow-y-auto rounded border border-border">
				{#if loading}
					<div class="p-3 text-xs text-muted-foreground">Searching…</div>
				{:else if results.length === 0}
					<div class="p-3 text-xs text-muted-foreground">No documents found.</div>
				{:else}
					<ul class="divide-y divide-border">
						{#each results as d (d.id)}
							<li>
								<button
									type="button"
									class="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
									onclick={() => onPick(d)}
								>
									<div class="text-sm font-medium truncate">{d.title}</div>
									<div class="text-xs text-muted-foreground font-mono truncate">{d.id}</div>
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
