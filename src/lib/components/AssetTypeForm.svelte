<script lang="ts" module>
	export type FieldFormValue = {
		name: string;
		label: string;
		type:
			| 'text'
			| 'number'
			| 'date'
			| 'select'
			| 'boolean'
			| 'list'
			| 'object'
			| 'ref'
			| 'array_ref';
		required: boolean;
		group: string;
		unit: string;
		options: string; // comma-separated for the select type
		asset_class_filter: string; // comma-separated class codes for ref / array_ref
	};

	export type AssetTypeFormValue = {
		code: string;
		label: string;
		family: 'EQUIPMENT' | 'STRUCTURAL' | 'RELATIONSHIP' | 'OTHER';
		description: string;
		color: string;
		enabled: boolean;
		attribute_fields: FieldFormValue[];
		valid_lifecycle_states: string; // comma-separated
		applicable_tabs: string; // comma-separated
	};

	export function emptyAssetTypeForm(): AssetTypeFormValue {
		return {
			code: '',
			label: '',
			family: 'EQUIPMENT',
			description: '',
			color: '#d4d4d4',
			enabled: true,
			attribute_fields: [],
			valid_lifecycle_states: 'operating, standby, shutdown, decommissioned',
			applicable_tabs: 'details, assessment, documents, history'
		};
	}

	function emptyField(): FieldFormValue {
		return {
			name: '',
			label: '',
			type: 'text',
			required: false,
			group: '',
			unit: '',
			options: '',
			asset_class_filter: ''
		};
	}

	export { emptyField };
</script>

<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';

	let {
		value = $bindable<AssetTypeFormValue>(emptyAssetTypeForm()),
		errors = {},
		codeLocked = false
	}: {
		value?: AssetTypeFormValue;
		errors?: Record<string, string>;
		codeLocked?: boolean;
	} = $props();

	const FAMILIES = [
		'EQUIPMENT',
		'STRUCTURAL',
		'RELATIONSHIP',
		'OTHER',
		'LAYER-1',
		'LAYER-2',
		'LAYER-3',
		'PROJECT',
		'PARTY',
		'ASSET'
	] as const;
	const FIELD_TYPES = [
		'text',
		'number',
		'date',
		'select',
		'boolean',
		'list',
		'object',
		'ref',
		'array_ref'
	] as const;

	// Suggest existing group names so typos don't create ghost groups.
	const groupSuggestions = $derived(
		Array.from(
			new Set(value.attribute_fields.map((f) => f.group).filter((g) => g.length > 0))
		).sort()
	);

	function addField() {
		value.attribute_fields = [...value.attribute_fields, emptyField()];
	}

	function removeField(i: number) {
		value.attribute_fields = value.attribute_fields.filter((_, idx) => idx !== i);
	}

	function moveField(i: number, dir: -1 | 1) {
		const target = i + dir;
		if (target < 0 || target >= value.attribute_fields.length) return;
		const next = [...value.attribute_fields];
		[next[i], next[target]] = [next[target], next[i]];
		value.attribute_fields = next;
	}

	function fieldError(i: number, key: string) {
		return errors[`attribute_fields.${i}.${key}`];
	}
</script>

<div class="space-y-6">
	<!-- Identity -->
	<section class="grid gap-4 sm:grid-cols-2">
		<div class="grid gap-1.5">
			<Label for="at-code">Code</Label>
			<Input
				id="at-code"
				class="font-mono"
				placeholder="PUMP-CENTRIFUGAL"
				value={value.code}
				disabled={codeLocked}
				oninput={(e) => (value.code = (e.currentTarget as HTMLInputElement).value.toUpperCase())}
			/>
			<p class="text-muted-foreground text-xs">UPPER-SNAKE-CASE. Used as the technical identifier.</p>
			{#if errors.code}<p class="text-destructive text-xs">{errors.code}</p>{/if}
		</div>
		<div class="grid gap-1.5">
			<Label for="at-label">Label</Label>
			<Input id="at-label" placeholder="Centrifugal pump" bind:value={value.label} />
			{#if errors.label}<p class="text-destructive text-xs">{errors.label}</p>{/if}
		</div>
		<div class="grid gap-1.5">
			<Label for="at-family">Family</Label>
			<select
				id="at-family"
				class="border-input bg-background h-9 rounded-md border px-3 text-sm"
				bind:value={value.family}
			>
				{#each FAMILIES as f}
					<option value={f}>{f}</option>
				{/each}
			</select>
			{#if errors.family}<p class="text-destructive text-xs">{errors.family}</p>{/if}
		</div>
		<div class="grid gap-1.5">
			<Label for="at-color">Colour</Label>
			<div class="flex items-center gap-2">
				<input
					id="at-color"
					type="color"
					class="border-input h-9 w-12 cursor-pointer rounded-md border"
					value={value.color || '#d4d4d4'}
					onchange={(e) => (value.color = (e.currentTarget as HTMLInputElement).value)}
				/>
				<Input class="font-mono" placeholder="#8fcaa3" bind:value={value.color} />
			</div>
			{#if errors.color}<p class="text-destructive text-xs">{errors.color}</p>{/if}
		</div>
		<div class="grid gap-1.5 sm:col-span-2">
			<Label for="at-description">Description</Label>
			<Input id="at-description" placeholder="Short description" bind:value={value.description} />
		</div>
		<div class="grid gap-1.5">
			<Label for="at-enabled">Enabled</Label>
			<label class="flex h-9 items-center gap-2">
				<input id="at-enabled" type="checkbox" class="size-4" bind:checked={value.enabled} />
				<span class="text-sm">{value.enabled ? 'Enabled' : 'Disabled'}</span>
			</label>
		</div>
	</section>

	<Separator />

	<!-- Field schema -->
	<section class="space-y-3">
		<datalist id="at-group-suggestions">
			{#each groupSuggestions as g}
				<option value={g}></option>
			{/each}
		</datalist>
		<div class="flex items-baseline justify-between">
			<h2 class="text-sm font-semibold">
				Attribute fields ({value.attribute_fields.length})
			</h2>
			<Button type="button" variant="outline" size="sm" onclick={addField}>
				<Plus class="size-4" /> Add field
			</Button>
		</div>

		{#if value.attribute_fields.length === 0}
			<p class="text-muted-foreground bg-muted/30 rounded-md border border-dashed p-6 text-center text-sm">
				No fields defined yet. Click "Add field" to start.
			</p>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<colgroup>
						<col style="width: 2rem" />
						<col style="width: 12rem" />
						<col style="width: 12rem" />
						<col style="width: 6rem" />
						<col style="width: 8rem" />
						<col style="width: 5rem" />
						<col />
						<col style="width: 3rem" />
						<col style="width: 2.5rem" />
					</colgroup>
					<thead class="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
						<tr>
							<th class="px-2 py-2"></th>
							<th class="px-2 py-2 font-medium">Name</th>
							<th class="px-2 py-2 font-medium">Label</th>
							<th class="px-2 py-2 font-medium">Type</th>
							<th class="px-2 py-2 font-medium">Group</th>
							<th class="px-2 py-2 font-medium">Unit</th>
							<th class="px-2 py-2 font-medium">Options / Filter</th>
							<th class="px-2 py-2 text-center font-medium">Req.</th>
							<th class="px-2 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each value.attribute_fields as f, i}
							<tr class="border-t align-top">
								<td class="px-1 py-2">
									<div class="flex flex-col items-center gap-0.5">
										<button
											type="button"
											class="hover:bg-muted rounded p-0.5 text-xs"
											title="Move up"
											onclick={() => moveField(i, -1)}
											disabled={i === 0}
										>▲</button>
										<button
											type="button"
											class="hover:bg-muted rounded p-0.5 text-xs"
											title="Move down"
											onclick={() => moveField(i, 1)}
											disabled={i === value.attribute_fields.length - 1}
										>▼</button>
									</div>
								</td>
								<td class="px-2 py-2">
									<input
										class="border-input bg-background h-8 w-full rounded border px-2 font-mono text-xs"
										placeholder="rated_flow_m3h"
										bind:value={f.name}
									/>
									{#if fieldError(i, 'name')}
										<p class="text-destructive text-xs">{fieldError(i, 'name')}</p>
									{/if}
								</td>
								<td class="px-2 py-2">
									<input
										class="border-input bg-background h-8 w-full rounded border px-2 text-xs"
										placeholder="Rated flow"
										bind:value={f.label}
									/>
									{#if fieldError(i, 'label')}
										<p class="text-destructive text-xs">{fieldError(i, 'label')}</p>
									{/if}
								</td>
								<td class="px-2 py-2">
									<select
										class="border-input bg-background h-8 w-full rounded border px-1 text-xs"
										bind:value={f.type}
									>
										{#each FIELD_TYPES as t}
											<option value={t}>{t}</option>
										{/each}
									</select>
									{#if fieldError(i, 'type')}
										<p class="text-destructive text-xs">{fieldError(i, 'type')}</p>
									{/if}
								</td>
								<td class="px-2 py-2">
									<input
										class="border-input bg-background h-8 w-full rounded border px-2 text-xs"
										placeholder="Performance"
										list="at-group-suggestions"
										bind:value={f.group}
									/>
								</td>
								<td class="px-2 py-2">
									{#if f.type === 'number'}
										<input
											class="border-input bg-background h-8 w-full rounded border px-2 text-xs"
											placeholder="m³/h"
											bind:value={f.unit}
										/>
									{:else}
										<input
											class="border-input bg-background h-8 w-full rounded border px-2 text-xs opacity-40"
											placeholder="—"
											disabled
										/>
									{/if}
								</td>
								<td class="px-2 py-2">
									{#if f.type === 'select'}
										<input
											class="border-input bg-background h-8 w-full rounded border px-2 text-xs"
											placeholder="a, b, c"
											bind:value={f.options}
										/>
									{:else if f.type === 'ref' || f.type === 'array_ref'}
										<input
											class="border-input bg-background h-8 w-full rounded border px-2 font-mono text-xs"
											placeholder="SPON, LEND (class codes)"
											bind:value={f.asset_class_filter}
										/>
									{:else}
										<input
											class="border-input bg-background h-8 w-full rounded border px-2 text-xs opacity-40"
											placeholder="—"
											disabled
										/>
									{/if}
								</td>
								<td class="px-2 py-2 text-center">
									<input type="checkbox" class="size-4" bind:checked={f.required} />
								</td>
								<td class="px-2 py-2 text-center">
									<button
										type="button"
										class="text-muted-foreground hover:text-destructive rounded p-1"
										onclick={() => removeField(i)}
										aria-label="Remove field"
									>
										<Trash2 class="size-4" />
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<Separator />

	<!-- Lifecycle + tabs -->
	<section class="grid gap-4 sm:grid-cols-2">
		<div class="grid gap-1.5">
			<Label for="at-lifecycle">Valid lifecycle states</Label>
			<Input
				id="at-lifecycle"
				placeholder="operating, standby, shutdown, decommissioned"
				bind:value={value.valid_lifecycle_states}
			/>
			<p class="text-muted-foreground text-xs">
				Comma-separated. Leave empty to allow any state.
			</p>
		</div>
		<div class="grid gap-1.5">
			<Label for="at-tabs">Applicable tabs</Label>
			<Input
				id="at-tabs"
				placeholder="details, assessment, documents, history"
				bind:value={value.applicable_tabs}
			/>
			<p class="text-muted-foreground text-xs">
				Comma-separated. Leave empty to show all tabs.
			</p>
		</div>
	</section>

	{#if errors._root}
		<p class="text-destructive text-sm">{errors._root}</p>
	{/if}
</div>
