<script lang="ts">
  import Search from 'lucide-svelte/icons/search';
  import { data } from '../stores';
  import type { JsonValue } from '../jsonModel';
  import TreeNode from './TreeNode.svelte';

  let query = $state('');
</script>

<div class="pane">
  <div class="search">
    <Search size={15} />
    <input type="text" placeholder="Search…" bind:value={query} />
  </div>
  <div class="tree">
    {#if $data !== null}
      <TreeNode label="root" value={$data as JsonValue} path={[]} {query} />
    {/if}
  </div>
</div>

<style>
  .pane { height:100%; display:flex; flex-direction:column; background:var(--sidebar);
    border-right:1px solid var(--border); }
  .search { display:flex; align-items:center; gap:6px; padding:10px 12px; color:var(--text-muted);
    border-bottom:1px solid var(--border); }
  .search input { flex:1; border:none; background:transparent; }
  .search input:focus { outline:none; }
  .tree { flex:1; overflow:auto; padding:8px 6px; font-size:13px; }
</style>
