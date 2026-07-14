import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';

const extensions = [StarterKit];

export function renderTiptapHtml(json: unknown): string | null {
	if (!json || typeof json !== 'object') return null;
	try {
		return generateHTML(json as Parameters<typeof generateHTML>[0], extensions);
	} catch {
		return null;
	}
}
