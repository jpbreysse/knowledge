<script lang="ts" module>
	// Mirrors the Knowledge app's findings-list badges, scraped 2026-05-01 from
	// http://localhost:5178/findings.
	export const SEVERITY_BADGE: Record<string, string> = {
		critical: 'bg-red-100 text-red-800 border-red-200',
		high: 'bg-orange-100 text-orange-800 border-orange-200',
		medium: 'bg-amber-100 text-amber-800 border-amber-200',
		low: 'bg-zinc-100 text-zinc-700 border-zinc-200'
	};

	export const STATUS_BADGE: Record<string, string> = {
		raised: 'bg-blue-100 text-blue-800 border-blue-200',
		reviewed: 'bg-purple-100 text-purple-800 border-purple-200',
		accepted: 'bg-green-100 text-green-800 border-green-200',
		mitigated: 'bg-teal-100 text-teal-800 border-teal-200',
		closed: 'bg-zinc-100 text-zinc-600 border-zinc-200'
	};
</script>

<script lang="ts">
	let {
		kind,
		value
	}: {
		kind: 'severity' | 'status';
		value: string;
	} = $props();

	const variant = $derived(
		kind === 'severity'
			? (SEVERITY_BADGE[value] ?? 'bg-zinc-100 text-zinc-700 border-zinc-200')
			: (STATUS_BADGE[value] ?? 'bg-zinc-100 text-zinc-700 border-zinc-200')
	);
</script>

<span class="inline-flex items-center px-1.5 py-0.5 rounded border text-xs {variant}">
	{value}
</span>
