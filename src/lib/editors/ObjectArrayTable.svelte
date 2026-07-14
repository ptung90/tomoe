<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Maximize2 from 'lucide-svelte/icons/maximize-2';
  import { objectKeyUnion, classify, type JsonValue, type Path } from '../jsonModel';
  import { addItem, removeItem, select, openBigEditor } from '../stores';
  import { isLongText } from '../textUtils';
  import LeafEditor from './LeafEditor.svelte';

  let { value, path }: { value: JsonValue[]; path: Path } = $props();
  const cols = $derived(objectKeyUnion(value));
  const isContainer = (v: JsonValue) => {
    const k = classify(v);
    return k === 'object' || k === 'array-of-objects' || k === 'array-of-scalars' || k === 'array-mixed';
  };
</script>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        {#each cols as col}<th>{col}</th>{/each}
        <th aria-label="actions"></th>
      </tr>
    </thead>
    <tbody>
      {#each value as row, i}
        <tr>
          {#each cols as col}
            <td>
              {#if isContainer((row as Record<string, JsonValue>)[col])}
                <button class="drill" onclick={() => select([...path, i, col])}>
                  {classify((row as Record<string, JsonValue>)[col])} <ChevronRight size={14} />
                </button>
              {:else if isLongText((row as Record<string, JsonValue>)[col])}
                <div class="long-cell">
                  <LeafEditor value={(row as Record<string, JsonValue>)[col] ?? ''} path={[...path, i, col]} compact />
                  <button class="expand" aria-label="expand editor" title="Expand editor"
                    onclick={() => openBigEditor([...path, i, col])}><Maximize2 size={14} /></button>
                </div>
              {:else}
                <LeafEditor value={(row as Record<string, JsonValue>)[col] ?? ''} path={[...path, i, col]} compact />
              {/if}
            </td>
          {/each}
          <td>
            <button class="rm" aria-label="delete row" onclick={() => removeItem(path, i)}>
              <Trash2 size={15} />
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <button class="add" onclick={() => addItem(path)}><Plus size={15} /> Add row</button>
</div>

<style>
  .table-wrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; }
  th { text-align:left; font-size:12px; color:var(--text-muted); font-weight:600;
    padding:6px 10px; border-bottom:2px solid var(--border); }
  td { padding:4px 8px; border-bottom:1px solid var(--border); vertical-align:middle; }
  .drill { display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border);
    background:var(--surface); border-radius:6px; padding:2px 8px; color:var(--text-muted); }
  .drill:hover { border-color:var(--accent); color:var(--accent); }
  .long-cell { display:flex; align-items:center; gap:4px; }
  .long-cell :global(input[type="text"]) { text-overflow:ellipsis; }
  .expand { display:flex; border:1px solid var(--border); background:var(--surface);
    color:var(--text-muted); border-radius:6px; padding:4px; flex:none; }
  .expand:hover { border-color:var(--accent); color:var(--accent); }
  .rm { display:flex; border:none; background:transparent; color:var(--text-muted); padding:4px; border-radius:6px; }
  .rm:hover { color:var(--accent); background:var(--accent-weak); }
  .add { display:inline-flex; align-items:center; gap:4px; margin-top:8px;
    border:1px dashed var(--accent); color:var(--accent); background:var(--accent-weak);
    border-radius:8px; padding:4px 12px; }
</style>
