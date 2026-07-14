<script lang="ts">
	import { Toaster as Sonner, type ToasterProps } from 'svelte-sonner';
	let { ...rest }: ToasterProps = $props();
</script>

<Sonner
	theme="light"
	class="toaster group"
	richColors
	closeButton
	{...rest}
/>
