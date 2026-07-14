import type { Severity, Status } from '$lib/types';

export const severityClasses: Record<Severity, string> = {
	critical: 'bg-red-100 text-red-800 border-red-200',
	high: 'bg-orange-100 text-orange-800 border-orange-200',
	medium: 'bg-amber-100 text-amber-800 border-amber-200',
	low: 'bg-zinc-100 text-zinc-700 border-zinc-200'
};

export const statusClasses: Record<Status, string> = {
	raised: 'bg-blue-100 text-blue-800 border-blue-200',
	reviewed: 'bg-purple-100 text-purple-800 border-purple-200',
	accepted: 'bg-teal-100 text-teal-800 border-teal-200',
	mitigated: 'bg-emerald-100 text-emerald-800 border-emerald-200',
	closed: 'bg-zinc-100 text-zinc-600 border-zinc-200'
};

export function relativeTime(input: string | Date | null | undefined): string {
	if (!input) return '';
	const d = typeof input === 'string' ? new Date(input) : input;
	const diff = Date.now() - d.getTime();
	const sec = Math.round(diff / 1000);
	if (sec < 60) return `${sec}s ago`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.round(min / 60);
	if (hr < 48) return `${hr}h ago`;
	const days = Math.round(hr / 24);
	if (days < 31) return `${days}d ago`;
	const months = Math.round(days / 30);
	if (months < 12) return `${months}mo ago`;
	const years = Math.round(days / 365);
	return `${years}y ago`;
}
