<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import { addItem, removeItem, select } from '../stores';
  import LeafEditor from './LeafEditor.svelte';

  let { value, path }: { value: JsonValue[]; path: Path } = $props();
  const isContainer = (v: JsonValue) => {
    const k = classify(v);
    return k === 'object' || k === 'array-of-objects' || k === 'array-of-scalars' || k === 'array-mixed';
  };
</script>

<div class="list">
  {#each value as item, i}
    <div class="item">
      <span class="idx">{i}</span>
      <div class="body">
        {#if isContainer(item)}
          <button class="drill" aria-label={`open item ${i + 1}`} onclick={() => select([...path, i])}>
            {classify(item)} <ChevronRight size={14} />
          </button>
        {:else}
          <LeafEditor value={item} path={[...path, i]} />
        {/if}
      </div>
      <button class="rm" aria-label="delete item" onclick={() => removeItem(path, i)}><Trash2 size={15} /></button>
    </div>
  {/each}
  <button class="add" onclick={() => addItem(path)}><Plus size={15} /> Add item</button>
</div>

<style>
  .list { display:flex; flex-direction:column; gap:6px; }
  .item { display:flex; align-items:center; gap:8px; }
  .idx { color:var(--text-muted); font-size:12px; min-width:1.5rem; text-align:right; }
  .body { flex:1; }
  .drill { display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border);
    background:var(--surface); border-radius:6px; padding:3px 10px; color:var(--text-muted); }
  .drill:hover { border-color:var(--accent); color:var(--accent); }
  .rm { display:flex; border:none; background:transparent; color:var(--text-muted); padding:4px; border-radius:6px; }
  .rm:hover { color:var(--accent); background:var(--accent-weak); }
  .add { display:inline-flex; align-items:center; gap:4px; margin-top:6px; align-self:flex-start;
    border:1px dashed var(--accent); color:var(--accent); background:var(--accent-weak);
    border-radius:8px; padding:4px 12px; }
</style>
