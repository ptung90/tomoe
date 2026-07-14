<script lang="ts">
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { getAtPath, type JsonValue, type Path } from '../jsonModel';
  import { data, select } from '../stores';
  import { pathExists } from '../pathUtils';
  import { itemLabel } from '../nodeLabel';
  import { truncate } from '../textUtils';

  let { path }: { path: Path } = $props();

  // For array-index segments, append a short preview (like the tree) for context.
  const crumbs = $derived(
    path.map((seg, i) => {
      const prefix = path.slice(0, i + 1);
      if (typeof seg === 'number' && $data !== null && pathExists($data, prefix)) {
        const full = itemLabel(getAtPath($data, prefix) as JsonValue, seg);
        return { path: prefix, text: `${seg}[${truncate(full, 12)}]`, title: full };
      }
      return { path: prefix, text: String(seg), title: String(seg) };
    }),
  );
</script>

<nav class="crumbs">
  <button onclick={() => select([])}>root</button>
  {#each crumbs as c}
    <ChevronRight size={13} class="sep" />
    <button title={c.title} onclick={() => select(c.path)}>{c.text}</button>
  {/each}
</nav>

<style>
  .crumbs { display:flex; align-items:center; gap:4px; flex-wrap:wrap; color:var(--text-muted); font-size:12px; }
  .crumbs button { border:none; background:transparent; color:var(--text-muted); padding:2px 4px;
    border-radius:4px; max-width:16rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .crumbs button:last-child { color:var(--text); font-weight:600; }
  .crumbs button:hover { color:var(--accent); background:var(--accent-weak); }
</style>
