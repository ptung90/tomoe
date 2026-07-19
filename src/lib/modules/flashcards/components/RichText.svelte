<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import AlignLeft from 'lucide-svelte/icons/align-left';
  import AlignCenter from 'lucide-svelte/icons/align-center';
  import AlignRight from 'lucide-svelte/icons/align-right';
  import { createEditor, htmlToMd } from '../lib/richtext';

  const LEVELS = [1, 2, 3, 4, 5, 6] as const; // heading buttons H1–H6

  let { value = '', onChange, compact = false }:
    { value?: string; onChange: (md: string) => void; compact?: boolean } = $props();
  let editor = $state<Editor | undefined>(undefined);
  let tick = $state(0); // bump to recompute toolbar active-state

  function mount(el: HTMLDivElement) {
    const ed = createEditor(el, value, () => { onChange(htmlToMd(ed.getHTML())); tick++; });
    ed.on('selectionUpdate', () => tick++);
    ed.on('transaction', () => tick++);
    editor = ed;
    return { destroy() { ed.destroy(); editor = undefined; } };
  }

  // TipTap isActive supports isActive(name, attrs?) and isActive(attrs).
  const active = (name: string | Record<string, unknown>, attrs?: Record<string, unknown>): boolean => {
    void tick; // re-run on selection/transaction ticks
    if (!editor) return false;
    return typeof name === 'string' ? editor.isActive(name, attrs) : editor.isActive(name);
  };
</script>

<div class="rt" class:compact>
  <div class="rt-toolbar">
    <button type="button" class:on={active('bold')} aria-label="bold"
      onclick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
    <button type="button" class:on={active('italic')} aria-label="italic"
      onclick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
    <button type="button" class:on={active('underline')} aria-label="underline"
      onclick={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></button>
    <span class="rt-div"></span>
    {#each LEVELS as lvl (lvl)}
      <button type="button" class:on={active('heading', { level: lvl })} aria-label={`h${lvl}`}
        title={lvl === 6 ? 'Heading 6 (subtitle)' : `Heading ${lvl}`}
        onclick={() => editor?.chain().focus().toggleHeading({ level: lvl }).run()}>H{lvl}</button>
    {/each}
    <button type="button" class:on={active('bulletList')} aria-label="bullet list"
      onclick={() => editor?.chain().focus().toggleBulletList().run()}>•</button>
    <button type="button" class:on={active('orderedList')} aria-label="ordered list"
      onclick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</button>
    <span class="rt-div"></span>
    <button type="button" class="rt-icon" class:on={active({ textAlign: 'left' })} aria-label="align left"
      onclick={() => editor?.chain().focus().setTextAlign('left').run()}><AlignLeft size={15} /></button>
    <button type="button" class="rt-icon" class:on={active({ textAlign: 'center' })} aria-label="align center"
      onclick={() => editor?.chain().focus().setTextAlign('center').run()}><AlignCenter size={15} /></button>
    <button type="button" class="rt-icon" class:on={active({ textAlign: 'right' })} aria-label="align right"
      onclick={() => editor?.chain().focus().setTextAlign('right').run()}><AlignRight size={15} /></button>
  </div>
  <div class="rt-editor" use:mount></div>
</div>

<style>
  .rt { flex:1 1 auto; min-width:0; border:1px solid var(--border); border-radius:8px; background:var(--bg); }
  .rt-toolbar { display:flex; align-items:center; gap:2px; flex-wrap:wrap; padding:4px 6px;
    border-bottom:1px solid var(--border); }
  .rt-toolbar button { border:none; background:transparent; color:var(--text);
    border-radius:6px; padding:3px 7px; font:inherit; min-width:26px; }
  .rt-toolbar button:hover { background:var(--accent-weak); color:var(--accent); }
  .rt-toolbar button.on { background:var(--accent); color:#fff; }
  .rt-toolbar button.rt-icon { display:inline-flex; align-items:center; justify-content:center; }
  .rt-div { width:1px; height:18px; background:var(--border); margin:0 4px; }
  .rt-editor { padding:8px 10px; min-height:60px; }
  .rt-editor :global(.ProseMirror) { outline:none; min-height:44px; }
  /* Short (text) fields share this editor — same toolbar, just fewer lines tall. */
  .rt.compact .rt-editor { padding:6px 9px; min-height:32px; }
  .rt.compact .rt-editor :global(.ProseMirror) { min-height:20px; }
  .rt-editor :global(.ProseMirror p) { margin:0 0 6px; }
</style>
