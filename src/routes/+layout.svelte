<script lang="ts">
	import './layout.css';
	import { goto } from '$app/navigation';
	import Toaster from '$lib/components/ui/sonner/sonner.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import Search from '@lucide/svelte/icons/search';
	import LogOut from '@lucide/svelte/icons/log-out';
	import { authClient, isAdmin } from '$lib/auth-client';

	let { data, children } = $props();

	async function logout() {
		await authClient.signOut();
		goto('/login');
	}

	const initials = $derived(
		(data.user?.name ?? '')
			.split(/\s+/)
			.map((w: string) => w[0])
			.slice(0, 2)
			.join('')
			.toUpperCase() || '?'
	);
</script>

<svelte:head>
	<title>Asset Registry</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	{#if data.user}
		<header class="border-b bg-card">
			<nav class="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
				<a href="/" class="font-semibold tracking-tight">Asset Registry</a>
				<a href="/assets" class="text-muted-foreground text-sm hover:text-foreground">Assets</a>
				<a href="/findings" class="text-muted-foreground text-sm hover:text-foreground">Findings</a>
				<a href="/tree" class="text-muted-foreground text-sm hover:text-foreground">Tree</a>
				<a href="/graph" class="text-muted-foreground text-sm hover:text-foreground">Graph</a>
				{#if isAdmin(data.user.role)}
					<a href="/connectors" class="text-muted-foreground text-sm hover:text-foreground">Connectors</a>
				{/if}
				<a href="/asset-types" class="text-muted-foreground text-sm hover:text-foreground">Asset types</a>
				<a href="/audit" class="text-muted-foreground text-sm hover:text-foreground">Audit</a>
				{#if isAdmin(data.user.role)}
					<a href="/admin/users" class="text-muted-foreground text-sm hover:text-foreground">Users</a>
				{/if}
				<!-- Discoverability hint for the Cmd-K palette. Click also opens it via
				     the same keydown handler the palette listens to. -->
				<button
					type="button"
					class="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
					onclick={() => {
						const isMac = navigator.platform.toLowerCase().includes('mac');
						window.dispatchEvent(
							new KeyboardEvent('keydown', {
								key: 'k',
								metaKey: isMac,
								ctrlKey: !isMac,
								bubbles: true
							})
						);
					}}
					title="Search (⌘K)"
				>
					<Search class="size-3.5" />
					<span>Search</span>
					<kbd class="rounded border bg-muted px-1 py-0.5 text-[0.6rem]">⌘K</kbd>
				</button>
				<div class="flex items-center gap-2" title={`${data.user.name} — ${data.user.role}`}>
					<span
						class="bg-muted text-foreground/80 inline-flex size-7 items-center justify-center rounded-full border text-xs font-semibold"
					>
						{initials}
					</span>
					<span class="text-muted-foreground hidden text-xs sm:inline">{data.user.role}</span>
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground"
						onclick={logout}
						title="Log out"
						aria-label="Log out"
					>
						<LogOut class="size-4" />
					</button>
				</div>
			</nav>
		</header>
	{/if}
	<main class="mx-auto max-w-6xl px-6 py-8">
		{@render children()}
	</main>
</div>

{#if data.user}
	<CommandPalette />
{/if}
<Toaster />
