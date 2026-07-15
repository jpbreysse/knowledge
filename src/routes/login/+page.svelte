<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { authClient } from '$lib/auth-client';

	let email = $state('');
	let password = $state('');
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!email.trim() || !password) return;
		submitting = true;
		errorMsg = null;
		const { error } = await authClient.signIn.email({ email: email.trim(), password });
		submitting = false;
		if (error) {
			errorMsg = error.message ?? 'Sign-in failed';
			return;
		}
		await invalidateAll();
		const to = page.url.searchParams.get('to');
		goto(to && to.startsWith('/') ? to : '/');
	}
</script>

<div class="flex min-h-[70vh] items-center justify-center">
	<form onsubmit={submit} class="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm">
		<div>
			<h1 class="text-lg font-semibold tracking-tight">Asset Registry</h1>
			<p class="text-muted-foreground text-sm">Sign in to continue.</p>
		</div>

		{#if errorMsg}
			<div class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
				{errorMsg}
			</div>
		{/if}

		<div class="grid gap-1.5">
			<Label for="email">Email</Label>
			<Input id="email" type="email" bind:value={email} autocomplete="username" />
		</div>
		<div class="grid gap-1.5">
			<Label for="password">Password</Label>
			<Input id="password" type="password" bind:value={password} autocomplete="current-password" />
		</div>

		<Button type="submit" class="w-full" disabled={submitting || !email.trim() || !password}>
			{submitting ? 'Signing in…' : 'Sign in'}
		</Button>

		<p class="text-muted-foreground text-xs">
			No account? Accounts are invite-only — ask an administrator.
		</p>
	</form>
</div>
