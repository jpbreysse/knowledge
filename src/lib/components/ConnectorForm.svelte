<script lang="ts" module>
	export type ConnectorFormValue = {
		name: string;
		label: string;
		base_url: string;
		path_prefix: string;
		auth_type: 'none';
		enabled: boolean;
		link_template: string;
	};

	export function emptyConnectorForm(): ConnectorFormValue {
		return {
			name: '',
			label: '',
			base_url: '',
			path_prefix: '/api',
			auth_type: 'none',
			enabled: true,
			link_template: '{base_url}/documents/{id}'
		};
	}
</script>

<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let {
		value = $bindable<ConnectorFormValue>(emptyConnectorForm()),
		errors = {},
		nameLocked = false
	}: {
		value?: ConnectorFormValue;
		errors?: Record<string, string>;
		nameLocked?: boolean;
	} = $props();
</script>

<div class="grid gap-4 sm:grid-cols-2">
	<div class="grid gap-1.5 sm:col-span-1">
		<Label for="conn-name">Name</Label>
		<Input
			id="conn-name"
			class="font-mono"
			placeholder="document-store"
			value={value.name}
			disabled={nameLocked}
			oninput={(e) => (value.name = (e.currentTarget as HTMLInputElement).value.toLowerCase())}
		/>
		<p class="text-muted-foreground text-xs">
			Slug — lowercase a–z, 0–9, hyphens. Used as the technical identifier.
		</p>
		{#if errors.name}<p class="text-destructive text-xs">{errors.name}</p>{/if}
	</div>

	<div class="grid gap-1.5 sm:col-span-1">
		<Label for="conn-label">Label</Label>
		<Input id="conn-label" placeholder="Document Store" bind:value={value.label} />
		<p class="text-muted-foreground text-xs">Display name shown in dropdowns and tables.</p>
		{#if errors.label}<p class="text-destructive text-xs">{errors.label}</p>{/if}
	</div>

	<div class="grid gap-1.5 sm:col-span-1">
		<Label for="conn-base-url">Base URL</Label>
		<Input
			id="conn-base-url"
			class="font-mono"
			placeholder="http://localhost:3001"
			bind:value={value.base_url}
		/>
		{#if errors.base_url}<p class="text-destructive text-xs">{errors.base_url}</p>{/if}
	</div>

	<div class="grid gap-1.5 sm:col-span-1">
		<Label for="conn-path-prefix">Path prefix</Label>
		<Input
			id="conn-path-prefix"
			class="font-mono"
			placeholder="/api"
			bind:value={value.path_prefix}
		/>
		<p class="text-muted-foreground text-xs">Optional. Leading slash required.</p>
		{#if errors.path_prefix}<p class="text-destructive text-xs">{errors.path_prefix}</p>{/if}
	</div>

	<div class="grid gap-1.5 sm:col-span-1">
		<Label for="conn-auth-type">Auth</Label>
		<select
			id="conn-auth-type"
			class="border-input bg-background h-9 rounded-md border px-3 text-sm"
			bind:value={value.auth_type}
		>
			<option value="none">none</option>
		</select>
		<p class="text-muted-foreground text-xs">
			Only "none" is supported in v2.2. Bearer / API key / OAuth come later.
		</p>
		{#if errors.auth_type}<p class="text-destructive text-xs">{errors.auth_type}</p>{/if}
	</div>

	<div class="grid gap-1.5 sm:col-span-1">
		<Label for="conn-enabled">Enabled</Label>
		<label class="flex h-9 items-center gap-2">
			<input id="conn-enabled" type="checkbox" class="size-4" bind:checked={value.enabled} />
			<span class="text-sm">{value.enabled ? 'Enabled' : 'Disabled'}</span>
		</label>
		<p class="text-muted-foreground text-xs">
			Disabled connectors don't appear in the asset Documents → Link form.
		</p>
	</div>

	<div class="grid gap-1.5 sm:col-span-2">
		<Label for="conn-link-template">Link template</Label>
		<Input
			id="conn-link-template"
			class="font-mono"
			placeholder="{'{base_url}'}/documents/{'{id}'}"
			bind:value={value.link_template}
		/>
		<p class="text-muted-foreground text-xs">
			Used to build the user-facing click-through URL for a single document.
			Placeholders: <code>{'{base_url}'}</code> (without trailing slash),
			<code>{'{id}'}</code> (required). For an SPA on a different host,
			set this directly, e.g. <code>http://localhost:5173/?id={'{id}'}</code>.
		</p>
		{#if errors.link_template}<p class="text-destructive text-xs">{errors.link_template}</p>{/if}
	</div>
</div>

{#if errors._root}
	<p class="text-destructive mt-3 text-sm">{errors._root}</p>
{/if}
