<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';
	import { SEVERITIES, type Severity } from '$lib/types';

	let title = $state('');
	let severity = $state<Severity>('medium');
	let saving = $state(false);

	async function save() {
		if (!title.trim()) {
			toast.error('Title is required');
			return;
		}
		saving = true;
		const id = crypto.randomUUID();
		try {
			const res = await fetch('/api/findings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, title: title.trim(), severity })
			});
			if (!res.ok) {
				toast.error('Save failed: ' + (await res.text()));
				return;
			}
			toast.success('Finding created');
			goto(`/findings/${id}?edit=1`);
		} finally {
			saving = false;
		}
	}
</script>

<a href="/findings" class="text-xs text-muted-foreground hover:text-foreground">← Back to findings</a>

<h1 class="mt-2 text-xl font-semibold tracking-tight mb-4">New finding</h1>

<div class="space-y-4 max-w-3xl">
	<div>
		<Label for="title" class="text-xs">Title</Label>
		<Input
			id="title"
			bind:value={title}
			placeholder="Short summary of the finding"
			class="mt-1"
		/>
	</div>

	<div>
		<Label for="severity" class="text-xs">Severity</Label>
		<select
			id="severity"
			bind:value={severity}
			class="mt-1 block w-48 text-sm border border-border rounded px-2 py-1 bg-background"
		>
			{#each SEVERITIES as s}
				<option value={s}>{s}</option>
			{/each}
		</select>
	</div>

	<div class="flex gap-2">
		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Create finding'}</Button>
		<Button variant="ghost" href="/findings" disabled={saving}>Cancel</Button>
	</div>

	<p class="text-xs text-muted-foreground">
		On save, a description document is created in the document store and you'll be taken to the
		finding's detail page to write the description, link assets, and link supporting documents.
	</p>
</div>
