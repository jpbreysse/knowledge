<script lang="ts" module>
	import { CONDITION_COLORS, CONDITION_COLOR_UNASSESSED, type ConditionRating } from '$lib/constants';

	export function conditionColor(rating: string | null | undefined) {
		if (!rating) return CONDITION_COLOR_UNASSESSED;
		return CONDITION_COLORS[rating as ConditionRating] ?? CONDITION_COLOR_UNASSESSED;
	}
</script>

<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		rating,
		size = 'sm',
		class: className
	}: {
		rating: string | null | undefined;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	} = $props();

	const color = $derived(conditionColor(rating));
	const display = $derived(rating ?? '—');

	const sizeClass = $derived(
		size === 'lg'
			? 'size-10 text-base'
			: size === 'md'
				? 'size-7 text-xs'
				: 'size-6 text-xs'
	);
</script>

<span
	class={cn(
		'inline-flex items-center justify-center rounded-md font-bold text-white shadow-sm',
		sizeClass,
		!rating && 'text-muted-foreground bg-transparent border border-dashed',
		className
	)}
	style={rating ? `background-color:${color}` : ''}
	title={rating ? `Condition ${rating}` : 'Not assessed'}
>
	{display}
</span>
