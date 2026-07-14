<script lang="ts">
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import { select } from '../stores';
  import { isLongText } from '../../../textUtils';
  import LeafEditor from './LeafEditor.svelte';

  let { value, path }: { value: Record<string, JsonValue>; path: Path } = $props();
  const keys = $derived(Object.keys(value));
  const isContainer = (v: JsonValue) => {
    const k = classify(v);
    return k === 'object' || k === 'array-of-objects' || k === 'array-of-scalars' || k === 'array-mixed';
  };
  // Nested containers and long text want a full row; simple scalars flow into the grid.
  const isFull = (v: JsonValue) => isContainer(v) || isLongText(v);
  const summary = (v: JsonValue) => {
    const k = classify(v);
    if (k === 'object') return `{ ${Object.keys(v as object).length} keys }`;
    if (k.startsWith('array')) return `[ ${(v as JsonValue[]).length} items ]`;
    return '';
  };
</script>

<div class="form">
  {#each keys as key}
    <div class="row" class:full={isFull(value[key])}>
      <div class="key">{key}</div>
      <div class="val">
        {#if isContainer(value[key])}
          <button class="drill" aria-label={`open ${key}`} onclick={() => select([...path, key])}>
            <span>{summary(value[key])}</span> <ChevronRight size={15} />
          </button>
        {:else}
          <LeafEditor value={value[key]} path={[...path, key]} />
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .form { display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap:8px 24px; align-items:start; }
  .row { display:grid; grid-template-columns: minmax(5rem, 11rem) 1fr; gap:10px; align-items:center; min-width:0; }
  .row.full { grid-column: 1 / -1; }
  .key { font-weight:600; color:var(--text); }
  .drill { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border);
    background:var(--surface); color:var(--text-muted); border-radius:8px; padding:5px 12px; width:100%;
    justify-content:space-between; }
  .drill:hover { border-color:var(--accent); color:var(--accent); }
</style>
