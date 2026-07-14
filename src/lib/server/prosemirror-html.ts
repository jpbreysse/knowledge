/**
 * Minimal ProseMirror JSON → HTML renderer for cached description previews.
 *
 * Handles the common node types the document app emits. Custom block types
 * (assetRef, todoBlock, bomBlock, maintenanceBlock, etc.) fall through to a
 * generic placeholder; the canonical render still happens in the document app
 * itself. This is just a "good-enough" cache for list views, search, and CSV.
 */

import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

interface PMNode {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	content?: PMNode[];
	marks?: { type: string; attrs?: Record<string, unknown> }[];
}

let purify: ReturnType<typeof DOMPurify> | null = null;
function getPurifier() {
	if (!purify) {
		const { window } = new JSDOM('<!DOCTYPE html>');
		purify = DOMPurify(window as unknown as Parameters<typeof DOMPurify>[0]);
	}
	return purify;
}

function escapeHtml(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function escapeAttr(s: unknown): string {
	return escapeHtml(String(s ?? ''));
}

function renderText(node: PMNode): string {
	let out = escapeHtml(node.text ?? '');
	for (const mark of node.marks ?? []) {
		switch (mark.type) {
			case 'strong':
			case 'bold':
				out = `<strong>${out}</strong>`;
				break;
			case 'em':
			case 'italic':
				out = `<em>${out}</em>`;
				break;
			case 'code':
				out = `<code>${out}</code>`;
				break;
			case 'strike':
			case 'strikethrough':
				out = `<s>${out}</s>`;
				break;
			case 'underline':
				out = `<u>${out}</u>`;
				break;
			case 'link': {
				const href = escapeAttr(mark.attrs?.href ?? '#');
				out = `<a href="${href}" rel="noopener" target="_blank">${out}</a>`;
				break;
			}
		}
	}
	return out;
}

function renderChildren(nodes: PMNode[] | undefined): string {
	return (nodes ?? []).map(renderNode).join('');
}

function renderNode(node: PMNode): string {
	switch (node.type) {
		case 'doc':
			return renderChildren(node.content);
		case 'paragraph':
			return `<p>${renderChildren(node.content)}</p>`;
		case 'heading': {
			const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
			return `<h${level}>${renderChildren(node.content)}</h${level}>`;
		}
		case 'blockquote':
			return `<blockquote>${renderChildren(node.content)}</blockquote>`;
		case 'bullet_list':
		case 'bulletList':
			return `<ul>${renderChildren(node.content)}</ul>`;
		case 'ordered_list':
		case 'orderedList':
			return `<ol>${renderChildren(node.content)}</ol>`;
		case 'list_item':
		case 'listItem':
			return `<li>${renderChildren(node.content)}</li>`;
		case 'code_block':
		case 'codeBlock':
			return `<pre><code>${renderChildren(node.content)}</code></pre>`;
		case 'horizontal_rule':
		case 'horizontalRule':
			return '<hr>';
		case 'hard_break':
		case 'hardBreak':
			return '<br>';
		case 'image': {
			const src = escapeAttr(node.attrs?.src);
			const alt = escapeAttr(node.attrs?.alt);
			return `<img src="${src}" alt="${alt}">`;
		}
		case 'text':
			return renderText(node);
		case 'assetRef': {
			const tag = escapeHtml(String(node.attrs?.tag ?? ''));
			const display = escapeAttr(node.attrs?.display ?? '');
			return `<span class="asset-ref" title="${display}">${tag}</span>`;
		}
		default:
			// Unknown / custom block — fall through and render any inner content
			// rather than dropping it entirely.
			return renderChildren(node.content);
	}
}

export function renderProseMirrorDocument(content: unknown): string {
	if (!content || typeof content !== 'object') return '';
	const html = renderNode(content as PMNode);
	return getPurifier().sanitize(html, { ADD_ATTR: ['target', 'rel'] });
}
