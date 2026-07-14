<script lang="ts">
  import FolderOpen from 'lucide-svelte/icons/folder-open';
  import Save from 'lucide-svelte/icons/save';
  import SaveAll from 'lucide-svelte/icons/save-all';
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import Redo2 from 'lucide-svelte/icons/redo-2';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Monitor from 'lucide-svelte/icons/monitor';
  import Columns2 from 'lucide-svelte/icons/columns-2';
  import Settings from 'lucide-svelte/icons/settings';
  import { data, filePath, dirty, canUndo, canRedo, undo, redo, theme, setTheme, twoLevel, setTwoLevel, openConfig } from '../stores';
  import { pickOpen, saveCurrent, pickSave } from '../fileService';
  import type { Theme } from '../theme';

  const fileName = $derived($filePath ? $filePath.split(/[\\/]/).pop() : 'No file');
  const nextTheme: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
</script>

<header class="toolbar">
  <div class="grp">
    <button onclick={pickOpen} title="Open (Ctrl+O)"><FolderOpen size={18} /> Open</button>
    <button onclick={saveCurrent} disabled={$data === null} title="Save (Ctrl+S)"><Save size={18} /> Save</button>
    <button onclick={pickSave} disabled={$data === null} title="Save As"><SaveAll size={18} /> Save As</button>
  </div>
  <span class="sep"></span>
  <div class="grp">
    <button onclick={undo} disabled={!$canUndo} aria-label="undo" title="Undo (Ctrl+Z)"><Undo2 size={18} /></button>
    <button onclick={redo} disabled={!$canRedo} aria-label="redo" title="Redo (Ctrl+Y)"><Redo2 size={18} /></button>
  </div>
  <div class="spacer"></div>
  <span class="file">{$dirty ? '● ' : ''}{fileName}</span>
  <button class="toggle2" class:on={$twoLevel} aria-pressed={$twoLevel} disabled={$data === null}
    onclick={() => setTwoLevel(!$twoLevel)} aria-label="two-column mode" title="Two-column mode">
    <Columns2 size={18} />
  </button>
  <button class="settings" onclick={openConfig} aria-label="settings" title="AI settings">
    <Settings size={18} />
  </button>
  <button class="theme" onclick={() => setTheme(nextTheme[$theme])} aria-label="toggle theme" title={`Theme: ${$theme}`}>
    {#if $theme === 'light'}<Sun size={18} />{:else if $theme === 'dark'}<Moon size={18} />{:else}<Monitor size={18} />{/if}
  </button>
</header>

<style>
  .toolbar { display:flex; align-items:center; gap:10px; padding:8px 12px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  .grp { display:flex; gap:4px; }
  .toolbar button { display:inline-flex; align-items:center; gap:6px; border:1px solid transparent;
    background:transparent; border-radius:8px; padding:5px 10px; color:var(--text); }
  .toolbar button:hover:not(:disabled) { background:var(--accent-weak); color:var(--accent); }
  .toolbar button:disabled { opacity:.4; cursor:default; }
  .sep { width:1px; height:22px; background:var(--border); }
  .spacer { flex:1; }
  .file { color:var(--text-muted); font-size:13px; }
  .toggle2 { color:var(--text-muted); }
  .toggle2.on { background:var(--accent-weak); color:var(--accent); }
  .settings, .theme { color:var(--text-muted); }
</style>
