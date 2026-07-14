<script lang="ts">
  import FileQuestion from 'lucide-svelte/icons/file-question';
  import { getAtPath, classify, type JsonValue } from '../jsonModel';
  import { data, selectedPath, twoLevel, editorTab, setEditorTab } from '../stores';
  import { pathExists } from '../pathUtils';
  import { hasContainerChild } from '../nodeUtils';
  import Breadcrumb from './Breadcrumb.svelte';
  import NodeView from './NodeView.svelte';
  import TwoLevelView from './TwoLevelView.svelte';
  import ParentTwoLevelView from './ParentTwoLevelView.svelte';
  import TextEditorView from './TextEditorView.svelte';

  const node = $derived(
    $data !== null && pathExists($data, $selectedPath) ? getAtPath($data, $selectedPath) : null,
  );
  const kind = $derived($data === null ? 'empty' : classify(node as JsonValue));
  // Case A: an object with nested children -> its own fields | a child.
  const useTwoLevel = $derived(
    $twoLevel && kind === 'object' && hasContainerChild(node as JsonValue),
  );
  // Case B: an array whose parent is an object -> parent's fields | this array.
  const parentPath = $derived($selectedPath.slice(0, -1));
  const parentNode = $derived(
    $twoLevel && $selectedPath.length > 0 && $data !== null && pathExists($data, parentPath)
      ? getAtPath($data, parentPath)
      : null,
  );
  const useParentTwoLevel = $derived(
    $twoLevel && !useTwoLevel && kind.startsWith('array')
      && parentNode !== null && classify(parentNode as JsonValue) === 'object',
  );
  const activeKey = $derived(String($selectedPath[$selectedPath.length - 1]));
</script>

{#if $data === null}
  <div class="empty">
    <FileQuestion size={40} />
    <p>No file open. Open a JSON file to start (Ctrl+O).</p>
  </div>
{:else}
  <div class="detail">
    <Breadcrumb path={$selectedPath} />
    <div class="tabs">
      <button class="tab" class:active={$editorTab === 'form'} onclick={() => setEditorTab('form')}>Form</button>
      <button class="tab" class:active={$editorTab === 'text'} onclick={() => setEditorTab('text')}>Text</button>
    </div>
    <div class="content">
      {#if $editorTab === 'text'}
        <TextEditorView />
      {:else if useTwoLevel}
        <TwoLevelView value={node as Record<string, JsonValue>} path={$selectedPath} />
      {:else if useParentTwoLevel}
        <ParentTwoLevelView
          parent={parentNode as Record<string, JsonValue>}
          parentPath={parentPath}
          activeKey={activeKey} />
      {:else}
        <NodeView value={node as JsonValue} path={$selectedPath} />
      {/if}
    </div>
  </div>
{/if}

<style>
  .detail { padding:16px; display:flex; flex-direction:column; gap:12px; height:100%; overflow:auto; }
  .tabs { display:flex; gap:4px; border-bottom:1px solid var(--border); }
  .tab { border:none; background:transparent; color:var(--text-muted); padding:6px 12px;
    border-bottom:2px solid transparent; margin-bottom:-1px; }
  .tab:hover { color:var(--accent); }
  .tab.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }
  .content { flex:1; min-height:0; }
  .empty { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:12px; color:var(--text-muted); text-align:center; padding:24px; }
</style>
