<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import { cn } from '$lib/utils';

	type JsonDoc = Record<string, unknown> | null;
	let {
		content = $bindable<JsonDoc>(null),
		editable = true,
		class: className,
		placeholder = 'Write a description…'
	}: {
		content?: JsonDoc;
		editable?: boolean;
		class?: string;
		placeholder?: string;
	} = $props();

	let el: HTMLDivElement;
	let editor: Editor | null = null;

	onMount(() => {
		editor = new Editor({
			element: el,
			extensions: [StarterKit],
			content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
			editable,
			onUpdate({ editor: ed }) {
				content = ed.getJSON() as JsonDoc;
			},
			editorProps: {
				attributes: {
					class: cn(
						'prose prose-sm max-w-none min-h-[120px] focus:outline-hidden',
						!editable && 'prose-neutral'
					),
					'data-placeholder': placeholder
				}
			}
		});
	});

	$effect(() => {
		if (editor && editor.isEditable !== editable) editor.setEditable(editable);
	});

	onDestroy(() => editor?.destroy());
</script>

<div
	bind:this={el}
	class={cn(
		'border-input bg-background rounded-md border p-3 [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
		className
	)}
></div>
