<script lang="ts">
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import { select } from '../stores';
  import LeafEditor from '../editors/LeafEditor.svelte';
  import NodeView from './NodeView.svelte';
  import { dragX } from '../actions/resize';

  let { parent, parentPath, activeKey }: {
    parent: Record<string, JsonValue>; parentPath: Path; activeKey: string;
  } = $props();
  let leftW = $state(340);

  const isContainer = (v: JsonValue) => {
    const k = classify(v);
    return k === 'object' || k.startsWith('array');
  };
  const keys = $derived(Object.keys(parent));
  const summary = (v: JsonValue) => {
    const k = classify(v);
    if (k === 'object') return `{ ${Object.keys(v as object).length} keys }`;
    return `[ ${(v as JsonValue[]).length} items ]`;
  };
</script>

<div class="two" style={`grid-template-columns:${leftW}px 6px 1fr`}>
  <div class="col left">
    {#each keys as key}
      <div class="row">
        <div class="key">{key}</div>
        <div class="val">
          {#if isContainer(parent[key])}
            <button class="open" class:active={key === activeKey}
              aria-label={`open ${key}`} onclick={() => select([...parentPath, key])}>
              <span>{summary(parent[key])}</span> <ChevronRight size={15} />
            </button>
          {:else}
            <LeafEditor value={parent[key]} path={[...parentPath, key]} />
          {/if}
        </div>
      </div>
    {/each}
  </div>
  <div
    class="divider"
    role="separator"
    aria-orientation="vertical"
    aria-label="resize column"
    use:dragX={(dx) => (leftW = Math.max(200, Math.min(720, leftW + dx)))}
  ></div>
  <div class="col right">
    <div class="rhead">{activeKey}</div>
    <NodeView value={parent[activeKey]} path={[...parentPath, activeKey]} />
  </div>
</div>

<style>
  .two { display:grid; gap:0; height:100%; min-height:0; }
  .col { min-height:0; min-width:0; overflow:auto; }
  .left { padding-right:16px; border-right:1px solid var(--border); display:flex; flex-direction:column; gap:8px; }
  .right { padding-left:16px; }
  .divider { cursor:col-resize; background:transparent; }
  .divider:hover { background:var(--accent-weak); }
  .row { display:grid; grid-template-columns: minmax(5rem, 9rem) 1fr; gap:10px; align-items:center; }
  .key { font-weight:600; color:var(--text); }
  .open { display:inline-flex; align-items:center; justify-content:space-between; gap:6px; width:100%;
    min-width:7rem; white-space:nowrap;
    border:1px solid var(--border); background:var(--surface); color:var(--text-muted);
    border-radius:8px; padding:5px 12px; }
  .open:hover { border-color:var(--accent); color:var(--accent); }
  .open.active { background:var(--accent); border-color:var(--accent); color:#fff; }
  .rhead { font-weight:600; color:var(--text-muted); margin-bottom:8px; }
</style>
