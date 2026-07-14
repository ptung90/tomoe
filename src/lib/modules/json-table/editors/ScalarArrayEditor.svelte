<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';
  import { type JsonValue, type Path } from '../jsonModel';
  import { addItem, removeItem } from '../stores';
  import LeafEditor from './LeafEditor.svelte';

  let { value, path }: { value: JsonValue[]; path: Path } = $props();
</script>

<div class="rows">
  {#each value as item, i}
    <div class="row">
      <div class="field"><LeafEditor value={item} path={[...path, i]} /></div>
      <button class="rm" aria-label="remove" onclick={() => removeItem(path, i)}>
        <X size={15} />
      </button>
    </div>
  {/each}
  <button class="add" aria-label="add" onclick={() => addItem(path)}>
    <Plus size={15} /> Add
  </button>
</div>

<style>
  .rows { display:flex; flex-direction:column; gap:6px; align-items:stretch; }
  .row { display:flex; align-items:center; gap:6px; }
  .field { flex:1; min-width:0; }
  .field :global(input[type="text"]), .field :global(textarea) { width:100%; }
  .rm { display:flex; border:none; background:transparent; color:var(--text-muted);
    border-radius:6px; padding:4px; flex:none; }
  .rm:hover { color:var(--accent); background:var(--accent-weak); }
  .add { display:inline-flex; align-items:center; gap:4px; align-self:flex-start; margin-top:2px;
    border:1px dashed var(--accent); color:var(--accent); background:var(--accent-weak);
    border-radius:8px; padding:4px 12px; }
</style>
