<script lang="ts">
  import FilePlus from 'lucide-svelte/icons/file-plus';
  import FolderOpen from 'lucide-svelte/icons/folder-open';
  import Save from 'lucide-svelte/icons/save';
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import Redo2 from 'lucide-svelte/icons/redo-2';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Monitor from 'lucide-svelte/icons/monitor';
  import SettingsIcon from 'lucide-svelte/icons/settings';
  import { activeModuleId, theme, configOpen, setActiveModule } from '../shell';
  import { getModule } from '../modules/registry';
  import { pickOpen, confirmDiscardIfDirty } from '../fileService';
  import type { Theme } from '../theme';

  const mod = $derived($activeModuleId ? getModule($activeModuleId) : null);
  // Store references, re-bound whenever the active module changes; `$` auto-subscribes reactively
  // and tolerates a null/undefined store (renders as `undefined` rather than throwing).
  const dirty = $derived(mod?.dirty);
  const canUndo = $derived(mod?.canUndo);
  const canRedo = $derived(mod?.canRedo);

  const nextTheme: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };

  async function handleNew() {
    if (await confirmDiscardIfDirty()) setActiveModule(null);
  }
</script>

<header class="toolbar">
  <div class="grp">
    <button onclick={handleNew} title="New / back to start screen">
      <FilePlus size={18} /> New
    </button>
    <button onclick={pickOpen} title="Open (Ctrl+O)"><FolderOpen size={18} /> Open</button>
    <button onclick={() => mod?.save()} disabled={!mod} title="Save (Ctrl+S)"><Save size={18} /> Save</button>
  </div>
  <span class="sep"></span>
  <div class="grp">
    <button onclick={() => mod?.undo()} disabled={!mod || !$canUndo} aria-label="undo" title="Undo (Ctrl+Z)">
      <Undo2 size={18} />
    </button>
    <button onclick={() => mod?.redo()} disabled={!mod || !$canRedo} aria-label="redo" title="Redo (Ctrl+Y)">
      <Redo2 size={18} />
    </button>
  </div>
  <div class="spacer"></div>
  {#if mod}
    <span class="file">{$dirty ? '● ' : ''}{mod.label}</span>
  {/if}
  <button class="theme" onclick={() => theme.set(nextTheme[$theme])} aria-label="toggle theme" title={`Theme: ${$theme}`}>
    {#if $theme === 'light'}<Sun size={18} />{:else if $theme === 'dark'}<Moon size={18} />{:else}<Monitor size={18} />{/if}
  </button>
  <button class="settings" onclick={() => configOpen.set(true)} aria-label="settings" title="Settings">
    <SettingsIcon size={18} />
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
  .theme, .settings { color:var(--text-muted); }
</style>
