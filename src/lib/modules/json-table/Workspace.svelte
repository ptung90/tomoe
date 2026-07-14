<script lang="ts">
  import { onMount } from 'svelte';
  import TreePane from './components/TreePane.svelte';
  import DetailPane from './components/DetailPane.svelte';
  import BigEditor from './editors/BigEditor.svelte';
  import { data, dirty } from './stores';
  import { dragX } from '../../actions/resize';

  let treeWidth = $state(300);

  // Open/Save/Undo/Redo and theme are owned by the shell (App.svelte) now that this
  // Workspace is one of several modules; only the browser close-guard stays local.
  function onBeforeUnload(e: BeforeUnloadEvent) { if ($dirty) { e.preventDefault(); e.returnValue = ''; } }

  onMount(() => {
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  });
</script>

<div class="workspace">
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
  <BigEditor />
</div>

<style>
  .workspace { flex:1; display:flex; flex-direction:column; min-height:0; }
  .body { flex:1; display:grid; min-height:0; }
  .left { min-height:0; min-width:0; }
  .right { min-height:0; min-width:0; background:var(--bg); }
  .divider { cursor:col-resize; background:transparent; }
  .divider:hover { background:var(--accent-weak); }
</style>
