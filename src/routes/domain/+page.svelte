<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/sonner';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	let { data } = $props();

	let loading = $state<number | 'latest' | null>(null);
	let expanded = $state<Set<string>>(new Set());

	async function loadVersion(version: number | 'latest') {
		loading = version;
		const res = await fetch('/api/domain/load', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ domain: 'lie', version })
		});
		loading = null;
		const j = await res.json().catch(() => ({}));
		if (!res.ok) {
			toast.error(j?.errors?._root ?? 'Load failed');
			return;
		}
		toast.success(
			`Loaded ${j.domain} v${j.version} — ${j.loaded.length} transaction rule${j.loaded.length === 1 ? '' : 's'}, ${j.disabled} disabled`
		);
		await invalidateAll();
	}

	function toggle(key: string) {
		const next = new Set(expanded);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		expanded = next;
	}

	type Rule = (typeof data.rules)[number];

	/** Human sentence for the two known shapes; anything else is flagged. */
	function sentence(r: Rule): string {
		const s = r.spec;
		if (s.uninterpretable || !s.trigger) return `⚠ not interpretable: ${s.uninterpretable ?? 'no trigger'}`;
		const cond = s.conditions.map((c) => `${c.field} is empty`).join(' and ');
		return `When ${s.trigger.field} becomes '${s.trigger.to}'${cond ? ` and ${cond}` : ''} → block: “${s.message}”`;
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
			<ShieldCheck class="size-6" /> Domain rules
		</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Transaction rules consumed from the ontology app. This app never edits rules — change them
			at the source and load a new version.
		</p>
	</div>

	<!-- Loaded state -->
	<section class="rounded-md border p-4">
		<h2 class="text-sm font-semibold">Loaded bundle</h2>
		{#if data.state}
			<p class="mt-1 text-sm">
				<span class="font-mono">{data.state.domain_code}</span>
				· version <span class="font-mono">v{data.state.domain_version}</span>
				· {data.state.rules} active rule{data.state.rules === 1 ? '' : 's'}
				· hash <span class="text-muted-foreground font-mono text-xs">{data.state.content_hash.slice(0, 16)}…</span>
			</p>
		{:else}
			<p class="text-muted-foreground mt-1 text-sm">No domain loaded — nothing is enforced.</p>
		{/if}
	</section>

	<!-- Published versions -->
	<section class="space-y-2">
		<h2 class="text-sm font-semibold">Published versions (lie)</h2>
		{#if data.ontologyDown}
			<div class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
				Ontology app unreachable at {data.ontologyUrl} — loaded rules keep enforcing; loading new
				versions requires it running.
			</div>
		{:else if data.versions.length === 0}
			<p class="text-muted-foreground text-sm">No published versions.</p>
		{:else}
			<div class="rounded-md border">
				<table class="w-full text-sm">
					<thead class="bg-muted/50">
						<tr class="text-left">
							<th class="px-3 py-2 font-medium">Version</th>
							<th class="px-3 py-2 font-medium">Hash</th>
							<th class="px-3 py-2 font-medium">Published</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each data.versions as v (v.version)}
							<tr class="border-t">
								<td class="px-3 py-2 font-mono">v{v.version}</td>
								<td class="text-muted-foreground px-3 py-2 font-mono text-xs">{v.hash.slice(0, 16)}…</td>
								<td class="text-muted-foreground px-3 py-2 text-xs">
									{new Date(v.published_at).toISOString().slice(0, 16).replace('T', ' ')}
									{#if v.published_by}· {v.published_by}{/if}
								</td>
								<td class="px-3 py-2 text-right">
									<Button
										size="sm"
										variant={data.state?.domain_version === v.version ? 'outline' : 'default'}
										disabled={loading !== null}
										onclick={() => loadVersion(v.version)}
									>
										{loading === v.version
											? 'Loading…'
											: data.state?.domain_version === v.version
												? 'Reload'
												: 'Load'}
									</Button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<!-- Active rules (read-only) -->
	<section class="space-y-2">
		<h2 class="text-sm font-semibold">Active transaction rules</h2>
		{#if data.rules.length === 0}
			<p class="text-muted-foreground text-sm">None loaded.</p>
		{:else}
			<div class="rounded-md border">
				<table class="w-full text-sm">
					<tbody>
						{#each data.rules as r (r.rule_id + r.domain_version)}
							{@const key = `${r.rule_id}:${r.domain_version}`}
							{@const isOpen = expanded.has(key)}
							<tr
								class="cursor-pointer border-t first:border-t-0 {r.enabled ? '' : 'opacity-45'}"
								onclick={() => toggle(key)}
							>
								<td class="w-8 px-3 py-2.5">
									{#if isOpen}<ChevronDown class="size-4" />{:else}<ChevronRight class="size-4" />{/if}
								</td>
								<td class="px-3 py-2.5">
									<div class="flex flex-wrap items-center gap-2">
										<span class="font-mono text-xs font-semibold">{r.rule_id}</span>
										<span class="text-muted-foreground text-xs">v{r.rule_version}</span>
										<span class="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.65rem]">{r.class_code}</span>
										{#if r.enabled}
											<span class="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[0.65rem] text-emerald-700">enabled</span>
										{:else}
											<span class="rounded border px-1.5 py-0.5 text-[0.65rem]">disabled · from {r.domain_code} v{r.domain_version}</span>
										{/if}
									</div>
									<p class="mt-1 text-sm">{sentence(r)}</p>
									{#if isOpen}
										<pre class="bg-muted/40 mt-2 overflow-x-auto rounded border p-2 text-xs">{JSON.stringify(r.spec, null, 2)}</pre>
									{/if}
								</td>
								<td class="px-3 py-2.5 text-right align-top">
									<a
										href={`${data.ontologyUrl}/domains`}
										target="_blank"
										rel="noopener"
										class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
										onclick={(e) => e.stopPropagation()}
									>
										source <ExternalLink class="size-3" />
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>
