<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from '$lib/components/ui/sonner';
	import { authClient, type Role } from '$lib/auth-client';
	import UserPlus from '@lucide/svelte/icons/user-plus';

	let { data } = $props();

	const ROLES: Role[] = ['admin', 'user', 'viewer'];

	let nName = $state('');
	let nEmail = $state('');
	let nRole = $state<Role>('viewer');
	let nPassword = $state('');
	let creating = $state(false);

	function generatePassword() {
		const bytes = crypto.getRandomValues(new Uint8Array(9));
		nPassword = btoa(String.fromCharCode(...bytes))
			.replaceAll('+', '-')
			.replaceAll('/', '_')
			.replace(/=+$/, '');
	}

	async function createUser(e: SubmitEvent) {
		e.preventDefault();
		creating = true;
		const { error } = await authClient.admin.createUser({
			email: nEmail.trim(),
			password: nPassword,
			name: nName.trim(),
			role: nRole as 'admin' | 'user'
		});
		creating = false;
		if (error) {
			toast.error(error.message ?? 'Could not create user');
			return;
		}
		toast.success(`Created ${nEmail} — share the password securely`);
		nName = '';
		nEmail = '';
		nRole = 'viewer';
		await invalidateAll();
	}

	async function setRole(userId: string, role: string) {
		const { error } = await authClient.admin.setRole({ userId, role: role as 'admin' | 'user' });
		if (error) toast.error(error.message ?? 'Could not change role');
		else {
			toast.success('Role updated');
			await invalidateAll();
		}
	}

	async function toggleBan(userId: string, banned: boolean | null) {
		const { error } = banned
			? await authClient.admin.unbanUser({ userId })
			: await authClient.admin.banUser({ userId });
		if (error) toast.error(error.message ?? 'Could not update user');
		else await invalidateAll();
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Users</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Invite-only. admin — everything · user — creates assets, classes, findings · viewer — read-only.
		</p>
	</div>

	<form onsubmit={createUser} class="grid gap-3 rounded-md border p-4 md:grid-cols-5 md:items-end">
		<div class="grid gap-1.5">
			<Label for="n-name">Name</Label>
			<Input id="n-name" bind:value={nName} />
		</div>
		<div class="grid gap-1.5">
			<Label for="n-email">Email</Label>
			<Input id="n-email" type="email" bind:value={nEmail} />
		</div>
		<div class="grid gap-1.5">
			<Label for="n-role">Role</Label>
			<select
				id="n-role"
				class="border-input bg-background h-9 rounded-md border px-3 text-sm"
				bind:value={nRole}
			>
				{#each ROLES as r}<option value={r}>{r}</option>{/each}
			</select>
		</div>
		<div class="grid gap-1.5">
			<Label for="n-pass">Password</Label>
			<div class="flex gap-1">
				<Input id="n-pass" bind:value={nPassword} class="font-mono text-xs" />
				<Button type="button" variant="outline" size="sm" onclick={generatePassword}>Gen</Button>
			</div>
		</div>
		<Button type="submit" disabled={creating || !nName.trim() || !nEmail.trim() || nPassword.length < 8}>
			<UserPlus class="size-4" />
			{creating ? 'Creating…' : 'Create user'}
		</Button>
	</form>

	<div class="rounded-md border">
		<table class="w-full text-sm">
			<thead class="bg-muted/50">
				<tr class="text-left">
					<th class="px-3 py-2 font-medium">Name</th>
					<th class="px-3 py-2 font-medium">Email</th>
					<th class="px-3 py-2 font-medium">Role</th>
					<th class="px-3 py-2 font-medium">Status</th>
					<th class="px-3 py-2 font-medium">Created</th>
					<th class="px-3 py-2"></th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as u (u.id)}
					<tr class="border-t {u.banned ? 'opacity-50' : ''}">
						<td class="px-3 py-2">{u.name}</td>
						<td class="px-3 py-2 font-mono text-xs">{u.email}</td>
						<td class="px-3 py-2">
							<select
								class="border-input bg-background h-8 rounded-md border px-2 text-xs"
								value={u.role ?? 'viewer'}
								onchange={(e) => setRole(u.id, e.currentTarget.value)}
							>
								{#each ROLES as r}<option value={r}>{r}</option>{/each}
							</select>
						</td>
						<td class="px-3 py-2">
							{#if u.banned}<span class="text-red-700">disabled</span>{:else}<span class="text-emerald-700">active</span>{/if}
						</td>
						<td class="text-muted-foreground px-3 py-2 text-xs">
							{new Date(u.created_at).toISOString().slice(0, 10)}
						</td>
						<td class="px-3 py-2 text-right">
							<Button variant="ghost" size="sm" onclick={() => toggleBan(u.id, u.banned)}>
								{u.banned ? 'Enable' : 'Disable'}
							</Button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
