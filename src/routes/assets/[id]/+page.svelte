<script lang="ts">
	import { page } from '$app/state';
	import { canWrite } from '$lib/auth-client';
	import { invalidateAll, goto } from '$app/navigation';
	import AssetForm, { type AssetFormValue } from '$lib/components/AssetForm.svelte';
	import ConditionBadge from '$lib/components/ConditionBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from '$lib/components/ui/sonner';
	import { CONDITION_LABELS, type ConditionRating } from '$lib/constants';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import FileText from '@lucide/svelte/icons/file-text';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import Link from '@lucide/svelte/icons/link';
	import Plus from '@lucide/svelte/icons/plus';
	import AddDocumentModal from '$lib/components/AddDocumentModal.svelte';
	import FindingsPanel from '$lib/components/FindingsPanel.svelte';
	import PrecedentsPanel from '$lib/components/PrecedentsPanel.svelte';
	import VersionHistoryPanel from '$lib/components/VersionHistoryPanel.svelte';
	import EntityLinksPanel from '$lib/components/EntityLinksPanel.svelte';

	let { data } = $props();

	let mode = $state<'view' | 'edit'>('view');
	let tab = $state<'details' | 'assessment' | 'documents' | 'history'>('details');

	const ALL_TABS = [
		['details', 'Details'],
		['assessment', 'Lummus DD'],
		['documents', 'Documents'],
		['history', 'History']
	] as const;

	// Tab visibility comes from the class's applicableTabs. Empty list = show all
	// (backwards-compatible default for classes that haven't been configured).
	const visibleTabs = $derived.by(() => {
		const allowed = data.assetClass?.applicableTabs ?? [];
		const filtered =
			allowed.length === 0 ? ALL_TABS : ALL_TABS.filter((t) => allowed.includes(t[0]));
		return filtered.map(([k, label]) => {
			if (k === 'documents') return [k, `${label} (${data.documents.length})`] as const;
			if (k === 'history') return [k, `${label} (${data.history.length})`] as const;
			return [k, label] as const;
		});
	});

	// If the current tab gets filtered out (e.g. class changes), bounce to the
	// first visible tab.
	$effect(() => {
		if (!visibleTabs.some((t) => t[0] === tab)) {
			tab = visibleTabs[0]?.[0] ?? 'details';
		}
	});

	const latestAssessment = $derived(data.assessments[0] ?? null);

	const SEVERITY_STYLE: Record<string, string> = {
		critical: 'bg-red-100 text-red-900 border-red-200',
		major: 'bg-orange-100 text-orange-900 border-orange-200',
		minor: 'bg-amber-50 text-amber-900 border-amber-200',
		observation: 'bg-slate-100 text-slate-700 border-slate-200'
	};

	const PRIORITY_STYLE: Record<string, string> = {
		urgent: 'bg-red-600 text-white',
		planned: 'bg-blue-600 text-white',
		monitor: 'bg-slate-500 text-white'
	};

	function fmtUsd(n: number | null | undefined) {
		if (n == null) return '—';
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 0
		}).format(n);
	}
	let errors = $state<Record<string, string>>({});
	let saving = $state(false);
	let formValue = $state<AssetFormValue>(toForm(data.asset));

	$effect(() => {
		// reset form when asset changes
		formValue = toForm(data.asset);
	});

	function toForm(a: typeof data.asset): AssetFormValue {
		return {
			tag: a.tag,
			name: a.name,
			class_code: a.classCode,
			parent_id: a.parentId ?? '',
			attributes: (a.attributes ?? {}) as Record<string, unknown>,
			content: (a.content ?? null) as Record<string, unknown> | null,
			confidentiality: a.confidentiality ?? '',
			version: a.version ?? '',
			supersedes_asset_id: a.supersedesAssetId ?? ''
		};
	}

	function toPayload(v: AssetFormValue) {
		const attrs: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(v.attributes)) {
			if (val !== undefined && val !== '') attrs[k] = val;
		}
		return {
			tag: v.tag,
			name: v.name,
			class_code: v.class_code,
			parent_id: v.parent_id || null,
			attributes: attrs,
			content: v.content,
			confidentiality: v.confidentiality || null,
			version: v.version || null,
			supersedes_asset_id: v.supersedes_asset_id || null
		};
	}

	async function save() {
		saving = true;
		errors = {};
		const res = await fetch(`/api/assets/${data.asset.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(toPayload(formValue))
		});
		saving = false;
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			errors = j.errors ?? { _root: j.error ?? 'failed to save' };
			// Transaction-rule refusal (422): name the rule and its provenance.
			if (res.status === 422 && j.rule) {
				toast.error(
					`Blocked by ${j.rule.id} v${j.rule.version} · ${j.rule.domain} v${j.rule.domainVersion}: ${Object.values(j.errors ?? {})[0] ?? ''}`
				);
				return;
			}
			toast.error(errors._root ?? 'Could not save changes');
			return;
		}
		toast.success('Saved');
		mode = 'view';
		await invalidateAll();
	}

	async function remove() {
		if (!confirm(`Delete asset ${data.asset.tag}? This cannot be undone.`)) return;
		const res = await fetch(`/api/assets/${data.asset.id}`, { method: 'DELETE' });
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			toast.error(j.error ?? 'Could not delete');
			return;
		}
		toast.success('Deleted');
		goto('/assets');
	}

	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function onUpload(e: SubmitEvent) {
		e.preventDefault();
		if (!fileInput) return;
		const files = fileInput.files;
		if (!files || files.length === 0) return;
		uploading = true;
		uploadError = null;
		const form = new FormData();
		form.append('file', files[0]);
		const res = await fetch(`/api/assets/${data.asset.id}/documents`, {
			method: 'POST',
			body: form
		});
		uploading = false;
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			uploadError = j.error ?? 'upload failed';
			toast.error(uploadError ?? 'Upload failed');
			return;
		}
		fileInput.value = '';
		toast.success('Uploaded');
		await invalidateAll();
	}

	// Add-document modal state
	let addOpen = $state(false);
	const firstConnector = $derived(data.enabledConnectors[0] ?? null);

	let deletingDocId = $state<string | null>(null);
	async function removeDoc(docId: string, filename: string) {
		if (!confirm(`Remove "${filename}" from this asset?`)) return;
		deletingDocId = docId;
		const res = await fetch(`/api/assets/${data.asset.id}/documents/${docId}`, {
			method: 'DELETE'
		});
		deletingDocId = null;
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			toast.error(j.error ?? j.message ?? 'Could not remove document');
			return;
		}
		toast.success('Document removed');
		await invalidateAll();
	}

	function fmtBytes(n: number | null) {
		if (!n) return '';
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<a href="/assets" class="text-muted-foreground text-sm hover:underline">← Back to assets</a>
			<div class="mt-2 flex items-baseline gap-3">
				<h1 class="font-mono text-2xl font-semibold tracking-tight">{data.asset.tag}</h1>
				{#if data.asset.version}
					<span class="text-muted-foreground font-mono text-sm">{data.asset.version}</span>
				{/if}
				<span class="text-muted-foreground">{data.asset.name}</span>
			</div>
			<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
				<Badge variant="outline">{data.asset.classCode}</Badge>
				{#if (data.asset.attributes as Record<string, unknown>)?.lifecycle_state}
					<Badge variant="secondary">
						{String((data.asset.attributes as Record<string, unknown>).lifecycle_state)}
					</Badge>
				{/if}
				{#if (data.asset.attributes as Record<string, unknown>)?.criticality != null}
					<Badge>Crit {String((data.asset.attributes as Record<string, unknown>).criticality)}</Badge>
				{/if}
				{#if latestAssessment?.status === 'assessed' && latestAssessment.conditionRating}
					<span class="inline-flex items-center gap-1.5">
						<ConditionBadge rating={latestAssessment.conditionRating} />
						<span class="text-muted-foreground">Lummus DD</span>
					</span>
				{:else if latestAssessment?.status === 'pending'}
					<Badge variant="outline">DD pending</Badge>
				{:else if latestAssessment?.status === 'not_in_scope'}
					<Badge variant="outline">DD not in scope</Badge>
				{/if}
			</div>
		</div>
		<div class="flex gap-2">
			{#if mode === 'view'}
				{#if canWrite(page.data.user?.role)}
					<Button onclick={() => (mode = 'edit')} variant="outline">
						<Pencil class="size-4" /> Edit
					</Button>
					<Button onclick={remove} variant="destructive"><Trash2 class="size-4" /> Delete</Button>
				{/if}
			{:else}
				<Button onclick={save} disabled={saving}>
					<Save class="size-4" />
					{saving ? 'Saving…' : 'Save'}
				</Button>
				<Button
					onclick={() => {
						formValue = toForm(data.asset);
						errors = {};
						mode = 'view';
					}}
					variant="ghost"
				>
					<X class="size-4" /> Cancel
				</Button>
			{/if}
		</div>
	</div>

	<Separator />

	<div class="flex gap-1 border-b">
		{#each visibleTabs as [k, label]}
			<button
				type="button"
				class="px-4 py-2 text-sm font-medium"
				class:border-b-2={tab === k}
				class:border-primary={tab === k}
				class:text-muted-foreground={tab !== k}
				onclick={() => (tab = k)}
			>
				{label}
			</button>
		{/each}
	</div>

	{#if tab === 'details'}
		<AssetForm
			bind:value={formValue}
			{errors}
			editable={mode === 'edit'}
			assetClasses={data.assetClasses}
			refLookup={new Map(Object.entries(data.refLookup ?? {}))}
		/>
	{:else if tab === 'assessment'}
		{#if !latestAssessment}
			<div
				class="bg-muted/30 flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center"
			>
				<ClipboardCheck class="text-muted-foreground size-8" />
				<p class="text-muted-foreground text-sm">
					No Lummus assessment for this asset yet.
				</p>
			</div>
		{:else if latestAssessment.status === 'pending'}
			<div
				class="bg-muted/30 flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center"
			>
				<ClipboardCheck class="text-muted-foreground size-8" />
				<p class="text-sm font-medium">Assessment pending</p>
				<p class="text-muted-foreground text-sm max-w-md">
					{latestAssessment.summary ?? 'This asset is queued for a future DD visit.'}
				</p>
			</div>
		{:else if latestAssessment.status === 'not_in_scope'}
			<div
				class="bg-muted/30 flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center"
			>
				<ClipboardCheck class="text-muted-foreground size-8" />
				<p class="text-sm font-medium">Not in scope of the recent DD engagement</p>
				<p class="text-muted-foreground max-w-md text-sm">
					This asset was excluded from the current Lummus due-diligence scope.
				</p>
			</div>
		{:else}
			<div class="space-y-6">
				<!-- Header strip -->
				<div class="bg-card grid grid-cols-2 gap-4 rounded-md border p-4 md:grid-cols-5">
					<div class="flex items-center gap-3">
						<ConditionBadge rating={latestAssessment.conditionRating} size="lg" />
						<div>
							<p class="text-muted-foreground text-xs uppercase">Condition</p>
							<p class="text-sm font-medium">
								{latestAssessment.conditionRating
									? CONDITION_LABELS[latestAssessment.conditionRating as ConditionRating]
									: '—'}
							</p>
						</div>
					</div>
					<div>
						<p class="text-muted-foreground text-xs uppercase">Remaining useful life</p>
						<p class="text-lg font-semibold">
							{latestAssessment.remainingUsefulLifeYears ?? '—'}
							<span class="text-muted-foreground text-sm font-normal">years</span>
						</p>
					</div>
					<div>
						<p class="text-muted-foreground text-xs uppercase">Risk score</p>
						<p class="text-lg font-semibold">
							{latestAssessment.riskScore ?? '—'}
							<span class="text-muted-foreground text-sm font-normal">/ 5</span>
						</p>
					</div>
					<div>
						<p class="text-muted-foreground text-xs uppercase">Recommended CapEx</p>
						<p class="text-lg font-semibold">{fmtUsd(latestAssessment.capexEstimateUsd)}</p>
					</div>
					<div>
						<p class="text-muted-foreground text-xs uppercase">Assessed</p>
						<p class="text-sm">
							{latestAssessment.assessedOn
								? new Date(latestAssessment.assessedOn).toLocaleDateString()
								: '—'}
						</p>
						<p class="text-muted-foreground text-xs">{latestAssessment.assessedBy ?? ''}</p>
					</div>
				</div>

				<!-- Summary -->
				{#if latestAssessment.summary}
					<blockquote
						class="border-primary/40 bg-muted/30 text-foreground rounded-r-md border-l-4 py-3 pl-4 pr-4 text-sm leading-relaxed"
					>
						{latestAssessment.summary}
					</blockquote>
				{/if}

				<!-- Findings -->
				<section class="space-y-2">
					<h2 class="text-sm font-semibold">Findings ({latestAssessment.findings.length})</h2>
					{#if latestAssessment.findings.length === 0}
						<p class="text-muted-foreground text-sm">No findings of note.</p>
					{:else}
						<ul class="space-y-2">
							{#each [...latestAssessment.findings].sort((a, b) => {
								const order = { critical: 0, major: 1, minor: 2, observation: 3 };
								return (order[a.severity as keyof typeof order] ?? 9) - (order[b.severity as keyof typeof order] ?? 9);
							}) as f}
								<li class="rounded-md border p-3">
									<div class="flex items-center gap-2">
										<span
											class="inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide {SEVERITY_STYLE[
												f.severity
											] ?? SEVERITY_STYLE.observation}"
										>
											{f.severity}
										</span>
										<span class="text-sm font-medium">{f.title}</span>
									</div>
									{#if f.detail}
										<p class="text-muted-foreground mt-1.5 text-sm leading-relaxed">
											{f.detail}
										</p>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<!-- Recommendations -->
				<section class="space-y-2">
					<h2 class="text-sm font-semibold">
						Recommendations ({latestAssessment.recommendations.length})
					</h2>
					{#if latestAssessment.recommendations.length === 0}
						<p class="text-muted-foreground text-sm">No recommendations.</p>
					{:else}
						<div class="rounded-md border">
							<table class="w-full text-sm">
								<thead class="bg-muted/50 text-left">
									<tr>
										<th class="px-3 py-2 font-medium">Action</th>
										<th class="px-3 py-2 font-medium">Priority</th>
										<th class="px-3 py-2 text-right font-medium">Est. CapEx</th>
										<th class="px-3 py-2 font-medium">Timing</th>
									</tr>
								</thead>
								<tbody>
									{#each latestAssessment.recommendations as r}
										<tr class="border-t align-top">
											<td class="px-3 py-2">{r.action}</td>
											<td class="px-3 py-2">
												<span
													class="inline-block rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide {PRIORITY_STYLE[
														r.priority
													] ?? PRIORITY_STYLE.monitor}"
												>
													{r.priority}
												</span>
											</td>
											<td class="px-3 py-2 text-right">{fmtUsd(r.capex_estimate_usd)}</td>
											<td class="text-muted-foreground px-3 py-2 text-xs">{r.timing ?? ''}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</section>
			</div>
		{/if}
	{:else if tab === 'documents'}
		<div class="space-y-4">
			{#if !canWrite(page.data.user?.role)}<span class="hidden"></span>{/if}
			<form onsubmit={onUpload} class:hidden={!canWrite(page.data.user?.role)} class="bg-muted/30 flex items-end gap-3 rounded-md border p-4">
				<div class="grid flex-1 gap-1.5">
					<label for="file" class="text-sm font-medium">Upload document</label>
					<input
						id="file"
						name="file"
						type="file"
						bind:this={fileInput}
						accept=".pdf,.png,.jpg,.jpeg,.docx"
						class="border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
					/>
					<p class="text-muted-foreground text-xs">PDF, PNG, JPG or DOCX · max 50 MB</p>
				</div>
				<Button type="submit" disabled={uploading}>
					<Upload class="size-4" />
					{uploading ? 'Uploading…' : 'Upload'}
				</Button>
			</form>
			{#if uploadError}<p class="text-destructive text-sm">{uploadError}</p>{/if}

			<div class="flex items-center gap-3">
				<Button
					variant="outline"
					onclick={() => (addOpen = true)}
					disabled={!firstConnector}
				>
					<Plus class="size-4" /> Add document
				</Button>
				{#if firstConnector}
					<span class="text-muted-foreground text-xs">
						from <span class="font-medium">{firstConnector.label}</span>
					</span>
				{:else}
					<span class="text-muted-foreground text-xs">
						No enabled connectors. <a href="/connectors/new" class="underline">Add one</a>
						to link external documents.
					</span>
				{/if}
			</div>

			{#if data.documents.length === 0}
				<p class="text-muted-foreground py-6 text-center text-sm">No documents yet.</p>
			{:else}
				<ul class="divide-y rounded-md border">
					{#each data.documents as d}
						<li class="flex items-center gap-3 px-4 py-2">
							{#if d.connectorId}
								<Link class="text-muted-foreground size-4" />
								<a
									href={d.externalUrl ?? '#'}
									target="_blank"
									rel="noopener"
									class="flex-1 text-sm hover:underline"
								>
									{d.filename}
								</a>
								<span class="inline-block rounded-md border bg-muted px-2 py-0.5 text-xs">
									{d.connectorLabel ?? d.connectorName}
								</span>
								<span class="text-muted-foreground text-xs">
									{new Date(d.uploadedAt).toLocaleString()}
								</span>
							{:else}
								<FileText class="text-muted-foreground size-4" />
								<a
									href={`/api/assets/${data.asset.id}/documents/${d.id}`}
									class="flex-1 text-sm hover:underline"
									download
								>
									{d.filename}
								</a>
								<span class="text-muted-foreground text-xs">{fmtBytes(d.sizeBytes)}</span>
								<span class="text-muted-foreground text-xs">
									{new Date(d.uploadedAt).toLocaleString()}
								</span>
							{/if}
							<button
								type="button"
								class="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
								title="Remove from asset"
								aria-label="Remove document"
								onclick={() => removeDoc(d.id, d.filename)}
								disabled={deletingDocId === d.id}
							>
								<Trash2 class="size-4" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<div class="rounded-md border">
			<table class="w-full text-sm">
				<thead class="bg-muted/50 text-left">
					<tr>
						<th class="px-3 py-2 font-medium">When</th>
						<th class="px-3 py-2 font-medium">Who</th>
						<th class="px-3 py-2 font-medium">Field</th>
						<th class="px-3 py-2 font-medium">Old</th>
						<th class="px-3 py-2 font-medium">New</th>
					</tr>
				</thead>
				<tbody>
					{#each data.history as h}
						<tr class="border-t align-top">
							<td class="text-muted-foreground whitespace-nowrap px-3 py-2 text-xs">
								{new Date(h.changedAt).toLocaleString()}
							</td>
							<td class="px-3 py-2 text-xs">{h.changedBy ?? ''}</td>
							<td class="px-3 py-2 font-mono text-xs">{h.fieldName}</td>
							<td class="px-3 py-2 text-xs"><code>{h.oldValue ?? ''}</code></td>
							<td class="px-3 py-2 text-xs"><code>{h.newValue ?? ''}</code></td>
						</tr>
					{:else}
						<tr>
							<td colspan="5" class="text-muted-foreground px-3 py-6 text-center">
								No changes recorded yet.
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<Separator />

	<FindingsPanel
	findings={data.findings}
	assetId={data.asset.id}
	assetTag={data.asset.tag}
	assetName={data.asset.name}
/>

	<Separator />

	<PrecedentsPanel precedents={data.precedents} />

	{#if data.versionChain && (data.versionChain.predecessors.length > 0 || data.versionChain.successors.length > 0)}
		<Separator />
		<VersionHistoryPanel chain={data.versionChain} />
	{/if}

	<Separator />
	<EntityLinksPanel
		assetId={data.asset.id}
		outgoing={data.entityLinks.outgoing}
		incoming={data.entityLinks.incoming}
	/>
</div>

<AddDocumentModal bind:open={addOpen} assetId={data.asset.id} connector={firstConnector} />
