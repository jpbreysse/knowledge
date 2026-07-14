/**
 * Human-readable relative time, e.g. "4d ago", "3mo ago".
 * Used by FindingsPanel and PrecedentsPanel — keep one source of truth.
 */
export function relativeTime(d: Date | string): string {
	const then = typeof d === 'string' ? new Date(d) : d;
	const diffSec = Math.round((Date.now() - then.getTime()) / 1000);
	if (diffSec < 60) return 'just now';
	const diffMin = Math.round(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.round(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDay = Math.round(diffHr / 24);
	if (diffDay < 30) return `${diffDay}d ago`;
	const diffMo = Math.round(diffDay / 30);
	if (diffMo < 12) return `${diffMo}mo ago`;
	return `${Math.round(diffMo / 12)}y ago`;
}
