<script lang="ts">
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import { selectedPath, select } from '../stores';
  import { subtreeMatches } from '../treeFilter';
  import { itemLabel } from '../nodeLabel';
  import { truncate } from '../textUtils';
  import Self from './TreeNode.svelte';

  let { label, value, path, query, index = null }: {
    label: string; value: JsonValue; path: Path; query: string; index?: number | null;
  } = $props();

  // Array-item previews can be long — hard-cap them next to the index (full text on hover).
  const display = $derived(index !== null ? truncate(label, 24) : label);

  const kind = $derived(classify(value));
  const isContainer = $derived(kind === 'object' || kind.startsWith('array'));
  const initiallyOpen = path.length === 0; // root open by default (stable per node)
  let manuallyOpen = $state(initiallyOpen);
  // Auto-reveal the chain down to the selected node so it's always visible.
  const isAncestorOfSelected = $derived(
    path.length < $selectedPath.length && path.every((s, i) => s === $selectedPath[i]),
  );
  const open = $derived(query.trim() ? true : (manuallyOpen || isAncestorOfSelected));
  const visible = $derived(subtreeMatches(label, value, query));

  const selected = $derived(
    $selectedPath.length === path.length && $selectedPath.every((s, i) => s === path[i]),
  );

  const entries = $derived(
    kind === 'object'
      ? Object.entries(value as Record<string, JsonValue>).map(
          ([k, v]) => ({ seg: k as string | number, label: k, index: null as number | null, value: v }),
        )
      : kind.startsWith('array')
        ? (value as JsonValue[]).map(
            (v, i) => ({ seg: i as string | number, label: itemLabel(v, i), index: i as number | null, value: v }),
          )
        : [],
  );
</script>

{#if visible}
  <div class="node">
    <div class="row" class:selected style={`padding-left:${path.length * 12 + 4}px`}>
      {#if isContainer}
        <button class="chev" aria-label={open ? 'collapse' : 'expand'} onclick={() => (manuallyOpen = !open)}>
          {#if open}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
        </button>
      {:else}
        <span class="chev-spacer"></span>
      {/if}
      {#if index !== null}<span class="idx">{index}</span>{/if}
      <button class="label" title={label} onclick={() => select(path)}>{display}</button>
    </div>
    {#if isContainer && open}
      {#each entries as e (e.seg)}
        <Self label={e.label} value={e.value} path={[...path, e.seg]} index={e.index} {query} />
      {/each}
    {/if}
  </div>
{/if}

<style>
  .row { display:flex; align-items:center; gap:2px; border-radius:6px; }
  .row:hover { background:var(--accent-weak); }
  .row.selected { background:var(--accent); }
  .row.selected .label,
  .row.selected .chev { color:#fff; }
  .row.selected .idx { color:rgba(255,255,255,0.72); }
  .row.selected .label { font-weight:600; }
  .chev, .label { border:none; background:transparent; color:var(--text); padding:3px 4px; }
  .chev { display:flex; color:var(--text-muted); }
  .chev-spacer { width:22px; }
  .idx { color:var(--text-muted); font-size:11px; font-variant-numeric:tabular-nums;
    min-width:1.25rem; text-align:right; opacity:0.7; flex:none; }
  .label { flex:1; min-width:0; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>
