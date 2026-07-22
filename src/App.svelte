<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import StartScreen from './lib/components/StartScreen.svelte';
  import Toast from './lib/components/Toast.svelte';
  import ConfigModal from './lib/components/ConfigModal.svelte';
  import { activeModuleId, theme, seedUserName, autoSaveEnabled } from './lib/shell';
  import { getModule } from './lib/modules/registry';
  import { pickOpen, loadStartupFile, listenForOpenFile } from './lib/fileService';
  import { applyTheme } from './lib/theme';
  import { startAutoSave } from './lib/autoSave';

  const mod = $derived($activeModuleId ? getModule($activeModuleId) : null);

  // Auto-save the active module: save a couple of seconds after edits settle, only for a doc that's
  // already bound to a file and while the feature is enabled. Re-wires when the active module changes.
  $effect(() => {
    const m = mod;
    if (!m) return;
    return startAutoSave({ enabled: autoSaveEnabled, dirty: m.dirty, filePath: m.filePath, save: () => void m.save() });
  });

  function onKeydown(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'o') { e.preventDefault(); pickOpen(); }
    else if (mod && e.ctrlKey && k === 's') { e.preventDefault(); mod.save(); }
    else if (mod && e.ctrlKey && k === 'z') { e.preventDefault(); mod.undo(); }
    else if (mod && e.ctrlKey && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); mod.redo(); }
  }

  $effect(() => { applyTheme($theme); });

  onMount(() => {
    seedUserName();
    listenForOpenFile();
    loadStartupFile();
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });
</script>

<div class="app">
  <Toolbar />
  {#if mod}
    {#key mod.id}<mod.Workspace />{/key}
  {:else}
    <StartScreen />
  {/if}
  <Toast />
  <ConfigModal />
</div>

<style>
  .app { height:100vh; display:flex; flex-direction:column; }
</style>
