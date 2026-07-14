<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import TreePane from './lib/components/TreePane.svelte';
  import DetailPane from './lib/components/DetailPane.svelte';
  import Toast from './lib/components/Toast.svelte';
  import BigEditor from './lib/editors/BigEditor.svelte';
  import ChatWidget from './lib/components/ChatWidget.svelte';
  import ConfigModal from './lib/components/ConfigModal.svelte';
  import { data, dirty, theme, undo, redo } from './lib/stores';
  import { pickOpen, saveCurrent } from './lib/fileService';
  import { applyTheme } from './lib/theme';
  import { dragX } from './lib/actions/resize';

  let treeWidth = $state(300);

  function onKeydown(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 's') { e.preventDefault(); saveCurrent(); }
    else if (e.ctrlKey && k === 'o') { e.preventDefault(); pickOpen(); }
    else if (e.ctrlKey && k === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); redo(); }
  }
  function onBeforeUnload(e: BeforeUnloadEvent) { if ($dirty) { e.preventDefault(); e.returnValue = ''; } }

  // Apply theme whenever it changes.
  $effect(() => { applyTheme($theme); });

  onMount(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  });
</script>

<div class="app">
  <Toolbar />
  {#if $data === null}
    <DetailPane />
  {:else}
    <div class="body" style={`grid-template-columns:${treeWidth}px 6px 1fr`}>
      <div class="left"><TreePane /></div>
      <div
        class="divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="resize sidebar"
        use:dragX={(dx) => (treeWidth = Math.max(180, Math.min(600, treeWidth + dx)))}
      ></div>
      <div class="right"><DetailPane /></div>
    </div>
  {/if}
  <Toast />
  <BigEditor />
  <ChatWidget />
  <ConfigModal />
</div>

<style>
  .app { height:100vh; display:flex; flex-direction:column; }
  .body { flex:1; display:grid; min-height:0; }
  .left { min-height:0; min-width:0; }
  .right { min-height:0; min-width:0; background:var(--bg); }
  .divider { cursor:col-resize; background:transparent; }
  .divider:hover { background:var(--accent-weak); }
</style>
