<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/sonner';
	import Download from '@lucide/svelte/icons/download';
	import FileUp from '@lucide/svelte/icons/file-up';
	import Upload from '@lucide/svelte/icons/upload';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	let { data } = $props();

	type PreviewRow = {
		line: number;
		cells: Record<string, string>;
		tag: string;
		name: string;
		errors: Record<string, string>;
		parsed?: unknown;
	};
	type Preview = {
		ok: boolean;
		fileErrors: string[];
		unknownColumns: string[];
		columns: string[];
		rows: PreviewRow[];
		summary: { total: number; valid: number; invalid: number };
		created?: { id: string; tag: string; line: number }[];
		skippedLines?: number[];
	};

	let classCode = $state(data.preselect);
	let csvText = $state('');
	let fileName = $state('');
	let preview = $state<Preview | null>(null);
	let previewing = $state(false);
	let committing = $state(false);
	let result = $state<Preview | null>(null);
	let hardMode = $state(false);
	let rowFilter = $state<'all' | 'ok' | 'error'>('all');
	let expanded = $state<Set<number>>(new Set());
	let dragOver = $state(false);

	const enabledClasses = $derived(data.assetClasses.filter((c) => c.enabled));
	const families = $derived([...new Set(enabledClasses.map((c) => c.family))]);
	const selectedClass = $derived(enabledClasses.find((c) => c.code === classCode) ?? null);
	const visibleRows = $derived(
		(preview?.rows ?? []).filter((r) =>
			rowFilter === 'all'
				? true
				: rowFilter === 'ok'
					? Object.keys(r.errors).length === 0
					: Object.keys(r.errors).length > 0
		)
	);

	function reset() {
		csvText = '';
		fileName = '';
		preview = null;
		result = null;
		rowFilter = 'all';
		expanded = new Set();
	}

	function onClassChange() {
		// schema changed — any previous preview is stale
		preview = null;
		result = null;
	}

	async function readFile(f: File | undefined) {
		if (!f) return;
		fileName = f.name;
		csvText = await f.text();
		preview = null;
		result = null;
	}

	async function runPreview() {
		if (!selectedClass || !csvText) return;
		previewing = true;
		const res = await fetch('/api/assets/import', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ class_code: classCode, csv: csvText })
		});
		previewing = false;
		const j = await res.json().catch(() => null);
		if (!res.ok && !j?.rows) {
			toast.error(Object.values(j?.errors ?? {}).join(', ') || 'Preview failed');
			return;
		}
		preview = j as Preview;
		rowFilter = preview.summary.invalid > 0 ? 'error' : 'all';
		expanded = new Set();
	}

	async function commit() {
		if (!selectedClass || !csvText || !preview) return;
		committing = true;
		const res = await fetch('/api/assets/import', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				class_code: classCode,
				csv: csvText,
				commit: true,
				mode: hardMode ? 'hard' : 'soft'
			})
		});
		committing = false;
		const j = (await res.json().catch(() => null)) as Preview | null;
		if (!res.ok || !j?.created) {
			// register changed between preview and commit, or hard-mode refusal
			if (j?.rows) {
				preview = j;
				rowFilter = 'error';
			}
			toast.error('Import refused — check the rows marked in red');
			return;
		}
		result = j;
		toast.success(`Imported ${j.created.length} asset${j.created.length === 1 ? '' : 's'}`);
	}

	function toggleRow(line: number) {
		const next = new Set(expanded);
		if (next.has(line)) next.delete(line);
		else next.add(line);
		expanded = next;
	}
</script>

<div class="space-y-6">
	<div>
		<a href="/assets" class="text-muted-foreground text-sm hover:underline">← Back to assets</a>
		<h1 class="mt-2 text-2xl font-semibold tracking-tight">Import assets</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			One CSV per class. Download the class template, fill it, upload, review, import.
		</p>
	</div>

	{#if result?.created}
		<!-- Step 3: done -->
		<div class="rounded-md border p-6">
			<div class="flex items-center gap-2 text-lg font-medium">
				<Check class="size-5 text-emerald-600" />
				{result.created.length} asset{result.created.length === 1 ? '' : 's'} imported
				{#if result.skippedLines?.length}
					<span class="text-muted-foreground text-sm font-normal">
						· {result.skippedLines.length} row{result.skippedLines.length === 1 ? '' : 's'} skipped
						(line{result.skippedLines.length === 1 ? '' : 's'} {result.skippedLines.join(', ')})
					</span>
				{/if}
			</div>
			<div class="mt-4 flex gap-2">
				<Button href={`/assets?class_code=${classCode}`}>View in list</Button>
				<Button variant="outline" onclick={reset}>Import more</Button>
			</div>
		</div>
	{:else}
		<!-- Step 1: class + file -->
		<div class="grid gap-4 rounded-md border p-4 md:grid-cols-2">
			<div class="space-y-2">
				<label class="text-sm font-medium" for="import-class">1. Class</label>
				<select
					id="import-class"
					class="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
					bind:value={classCode}
					onchange={onClassChange}
				>
					<option value="">Choose a class…</option>
					{#each families as fam}
						<optgroup label={fam}>
							{#each enabledClasses.filter((c) => c.family === fam) as c}
								<option value={c.code}>{c.code} — {c.label}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
				{#if selectedClass}
					<p class="text-muted-foreground text-xs">
						{selectedClass.family}
						{#if selectedClass.idPrefix}· auto-tag prefix <code>{selectedClass.idPrefix}</code>{/if}
						· {(selectedClass.attributeFields ?? []).length} attribute field{(selectedClass.attributeFields ?? []).length === 1 ? '' : 's'}
					</p>
					<Button
						href={`/api/asset-types/${selectedClass.id}/import-template.csv`}
						variant="outline"
						size="sm"
					>
						<Download class="size-4" /> Download CSV template
					</Button>
				{/if}
			</div>

			<div class="space-y-2">
				<span class="text-sm font-medium">2. File</span>
				<label
					class="border-input hover:bg-muted/50 flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed text-sm transition-colors {dragOver
						? 'bg-muted'
						: ''}"
					ondragover={(e) => {
						e.preventDefault();
						dragOver = true;
					}}
					ondragleave={() => (dragOver = false)}
					ondrop={(e) => {
						e.preventDefault();
						dragOver = false;
						readFile(e.dataTransfer?.files?.[0]);
					}}
				>
					<FileUp class="text-muted-foreground mb-1 size-5" />
					{#if fileName}
						<span class="font-medium">{fileName}</span>
						<span class="text-muted-foreground text-xs">click or drop to replace</span>
					{:else}
						<span>Drop CSV here or click to choose</span>
					{/if}
					<input
						type="file"
						accept=".csv,text/csv"
						class="hidden"
						onchange={(e) => readFile(e.currentTarget.files?.[0])}
					/>
				</label>
				<Button onclick={runPreview} disabled={!selectedClass || !csvText || previewing}>
					<Upload class="size-4" />
					{previewing ? 'Checking…' : 'Preview import'}
				</Button>
			</div>
		</div>

		<!-- Step 2: preview -->
		{#if preview}
			{#if preview.fileErrors.length > 0}
				<div class="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
					<p class="font-medium">File rejected</p>
					<ul class="mt-1 list-inside list-disc">
						{#each preview.fileErrors as e}<li>{e}</li>{/each}
					</ul>
				</div>
			{:else}
				{#if preview.unknownColumns.length > 0}
					<div class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
						Ignored unknown column{preview.unknownColumns.length === 1 ? '' : 's'}:
						{preview.unknownColumns.join(', ')}
					</div>
				{/if}

				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex items-center gap-3 text-sm">
						<span class="font-medium text-emerald-700">{preview.summary.valid} ready</span>
						<span class="font-medium {preview.summary.invalid > 0 ? 'text-red-700' : 'text-muted-foreground'}">
							{preview.summary.invalid} error{preview.summary.invalid === 1 ? '' : 's'}
						</span>
						<div class="ml-2 flex overflow-hidden rounded-md border text-xs">
							{#each [{ k: 'all', label: `All (${preview.summary.total})` }, { k: 'ok', label: `Ready (${preview.summary.valid})` }, { k: 'error', label: `Errors (${preview.summary.invalid})` }] as f}
								<button
									type="button"
									class="px-2.5 py-1 {rowFilter === f.k ? 'bg-muted font-medium' : 'hover:bg-muted/50'}"
									onclick={() => (rowFilter = f.k as typeof rowFilter)}
								>
									{f.label}
								</button>
							{/each}
						</div>
					</div>
					<div class="flex items-center gap-3">
						<label class="flex items-center gap-1.5 text-sm">
							<input type="checkbox" bind:checked={hardMode} />
							Fail whole import on any error
						</label>
						<Button
							onclick={commit}
							disabled={committing ||
								preview.summary.valid === 0 ||
								(hardMode && preview.summary.invalid > 0)}
						>
							{committing
								? 'Importing…'
								: `Import ${preview.summary.valid} row${preview.summary.valid === 1 ? '' : 's'}`}
						</Button>
					</div>
				</div>

				<div class="rounded-md border">
					<table class="w-full text-sm">
						<thead class="bg-muted/50">
							<tr class="text-left">
								<th class="w-8 px-3 py-2"></th>
								<th class="px-3 py-2 font-medium">Line</th>
								<th class="px-3 py-2 font-medium">Tag</th>
								<th class="px-3 py-2 font-medium">Name</th>
								<th class="px-3 py-2 font-medium">Parent</th>
								<th class="px-3 py-2 font-medium">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each visibleRows as row (row.line)}
								{@const errCount = Object.keys(row.errors).length}
								{@const isOpen = expanded.has(row.line)}
								<tr
									class="cursor-pointer border-t {errCount > 0 ? 'bg-red-50/50' : ''} hover:bg-muted/30"
									onclick={() => toggleRow(row.line)}
								>
									<td class="px-3 py-1.5">
										{#if isOpen}<ChevronDown class="size-4" />{:else}<ChevronRight class="size-4" />{/if}
									</td>
									<td class="text-muted-foreground px-3 py-1.5">{row.line}</td>
									<td class="px-3 py-1.5 font-mono text-xs">{row.tag}</td>
									<td class="px-3 py-1.5">{row.name}</td>
									<td class="text-muted-foreground px-3 py-1.5 font-mono text-xs">
										{row.cells.parent_tag ?? ''}
									</td>
									<td class="px-3 py-1.5">
										{#if errCount === 0}
											<span class="inline-flex items-center gap-1 text-emerald-700">
												<Check class="size-3.5" /> ready
											</span>
										{:else}
											<span class="inline-flex items-center gap-1 text-red-700">
												<X class="size-3.5" />
												{Object.entries(row.errors)[0][0]}: {Object.entries(row.errors)[0][1]}
												{#if errCount > 1}<span class="text-xs">+{errCount - 1} more</span>{/if}
											</span>
										{/if}
									</td>
								</tr>
								{#if isOpen}
									<tr class="border-t bg-muted/20">
										<td></td>
										<td colspan="5" class="px-3 py-2">
											<div class="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
												{#each preview.columns as col}
													<div class="flex items-baseline justify-between gap-2 py-0.5">
														<span class="text-muted-foreground font-mono">{col}</span>
														<span class="text-right {row.errors[col] ? 'text-red-700' : ''}">
															{row.cells[col] || '—'}
															{#if row.errors[col]}<span class="block font-medium">✗ {row.errors[col]}</span>{/if}
														</span>
													</div>
												{/each}
											</div>
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}
	{/if}
</div>
