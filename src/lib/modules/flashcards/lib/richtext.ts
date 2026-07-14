import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { marked } from 'marked';
import TurndownService from 'turndown';

/** Markdown -> HTML for loading into the editor. Synchronous. */
export function mdToHtml(md: string): string {
  return marked.parse(md ?? '', { async: false }) as string;
}

let _td: TurndownService | null = null;
function turndown(): TurndownService {
  if (_td) return _td;
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  // Tight list items: no blank line between items (ported from flashcard-creator).
  td.addRule('tightListItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement;
      let prefix: string;
      if (parent && parent.nodeName === 'OL') {
        const start = parent.getAttribute('start');
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = (start ? Number(start) + index : index + 1) + '. ';
      } else {
        prefix = (options.bulletListMarker || '-') + ' ';
      }
      const indent = ' '.repeat(prefix.length);
      const body = content.trim().replace(/\n{3,}/g, '\n\n').replace(/\n/g, '\n' + indent);
      return prefix + body + '\n';
    },
  });
  // Keep explicit paragraph alignment as inline HTML (ported).
  td.addRule('alignedParagraph', {
    filter: (node) => node.nodeName === 'P' && !!(node as HTMLElement).style && !!(node as HTMLElement).style.textAlign,
    replacement: (content, node) =>
      `\n\n<p style="text-align:${(node as HTMLElement).style.textAlign}">${content}</p>\n\n`,
  });
  _td = td;
  return td;
}

/** HTML (from the editor) -> Markdown for storage. Trimmed. */
export function htmlToMd(html: string): string {
  return turndown().turndown(html).trim();
}

/** Build a TipTap editor bound to `element`, seeded from Markdown. */
export function createEditor(element: HTMLElement, markdown: string, onUpdate: () => void): Editor {
  return new Editor({
    element,
    extensions: [StarterKit, Underline, TextAlign.configure({ types: ['heading', 'paragraph'] })],
    content: mdToHtml(markdown),
    onUpdate,
  });
}
