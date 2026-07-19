<script lang="ts">
  import CornerDownLeft from 'lucide-svelte/icons/corner-down-left';
  import TypeIcon from 'lucide-svelte/icons/type';
  import PenLine from 'lucide-svelte/icons/pen-line';
  import { insertBreak, wrapSmall, type EditResult } from '../lib/shortEdit';
  import RichText from './RichText.svelte';

  let { value = '', onChange }: { value?: string; onChange: (v: string) => void } = $props();

  let mode = $state<'simple' | 'rich'>('simple');
  let el = $state<HTMLTextAreaElement | undefined>(undefined);

  function autosize(t: HTMLTextAreaElement) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
  function mount(t: HTMLTextAreaElement) { el = t; autosize(t); return { destroy() { el = undefined; } }; }

  // Apply a mini-toolbar op at the current selection, then restore focus + caret after the value
  // round-trips through the parent store.
  function apply(fn: (v: string, s: number, e: number) => EditResult) {
    if (!el) return;
    const r = fn(el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length);
    onChange(r.value);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(r.selStart, r.selEnd);
      autosize(el);
    });
  }
</script>

{#if mode === 'rich'}
  <div class="st">
    <div class="st-bar">
      <span class="st-spacer"></span>
      <button type="button" class="st-mode on" title="Switch back to simple text"
        onclick={() => (mode = 'simple')}><PenLine size={13} /> Rich</button>
    </div>
    <RichText {value} {onChange} />
  </div>
{:else}
  <div class="st">
    <div class="st-bar">
      <button type="button" title="Insert a line break (<br>)" aria-label="line break"
        onclick={() => apply(insertBreak)}><CornerDownLeft size={14} /></button>
      <button type="button" title="Wrap selection as a small subtitle (<small>…</small>)" aria-label="subtitle"
        onclick={() => apply(wrapSmall)}><TypeIcon size={14} /></button>
      <span class="st-spacer"></span>
      <button type="button" class="st-mode" title="Switch to the rich text editor"
        onclick={() => (mode = 'rich')}><PenLine size={13} /> Rich</button>
    </div>
    <textarea class="st-input" rows="1" {value} use:mount
      oninput={(e) => { onChange(e.currentTarget.value); autosize(e.currentTarget); }}></textarea>
    {#if value.trim()}
      <div class="st-preview" aria-hidden="true">{@html value}</div>
    {/if}
  </div>
{/if}

<style>
  .st { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:4px; }
  .st-bar { display:flex; align-items:center; gap:2px; }
  .st-bar button { display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border);
    background:var(--bg); color:var(--text); border-radius:6px; padding:3px 6px; font:inherit; line-height:1; }
  .st-bar button:hover { background:var(--accent-weak); color:var(--accent); border-color:var(--accent); }
  .st-bar button.st-mode { font-size:11px; font-weight:600; }
  .st-bar button.st-mode.on { background:var(--accent); color:#fff; border-color:var(--accent); }
  .st-spacer { flex:1; }
  .st-input { width:100%; box-sizing:border-box; padding:7px 9px; border:1px solid var(--border);
    border-radius:6px; background:var(--bg); color:var(--text); font:inherit; resize:none; overflow:hidden; }
  .st-preview { font-size:12px; color:var(--text-muted); padding:2px 4px; border-left:2px solid var(--border);
    line-height:1.35; }
  .st-preview :global(small) { font-size:0.8em; opacity:0.85; }
</style>
