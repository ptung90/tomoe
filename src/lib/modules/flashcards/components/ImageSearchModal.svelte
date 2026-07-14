<script lang="ts">
  import SearchIcon from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';
  import { searchWikimedia, type ImageHit } from '../lib/imageSearch';

  let { onPick, onClose, search = searchWikimedia }: {
    onPick: (url: string) => void; onClose: () => void; search?: typeof searchWikimedia;
  } = $props();

  let query = $state('');
  let hits = $state<ImageHit[]>([]);
  let status = $state<'idle' | 'loading' | 'error' | 'done'>('idle');

  async function run(e: Event) {
    e.preventDefault();
    if (!query.trim()) return;
    status = 'loading';
    try { hits = await search(query.trim()); status = 'done'; }
    catch { hits = []; status = 'error'; }
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <header class="head">
      <form class="searchbar" onsubmit={run}>
        <SearchIcon size={15} />
        <input placeholder="Search Wikimedia images…" bind:value={query} />
        <button type="submit">Search</button>
      </form>
      <button type="button" class="close" aria-label="close" onclick={onClose}><X size={16} /></button>
    </header>
    <div class="results">
      {#if status === 'loading'}
        <p class="msg">Searching…</p>
      {:else if status === 'error'}
        <p class="msg">Couldn't reach Wikimedia. Check your connection and try again.</p>
      {:else if status === 'done' && hits.length === 0}
        <p class="msg">No images found.</p>
      {:else}
        <div class="grid">
          {#each hits as h (h.full)}
            <button type="button" class="hit" title={h.title} onclick={() => onPick(h.full)}>
              <img src={h.thumb} alt={h.title} loading="lazy" />
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:60; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(680px,94vw); max-height:86vh; display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--border); }
  .searchbar { flex:1; display:flex; align-items:center; gap:8px; border:1px solid var(--border); border-radius:8px; padding:4px 10px; color:var(--text-muted); }
  .searchbar input { flex:1; border:none; background:transparent; color:var(--text); font:inherit; outline:none; }
  .searchbar button { border:1px solid var(--accent); background:var(--accent); color:#fff; border-radius:6px; padding:4px 12px; font:inherit; font-size:12px; }
  .close { border:none; background:transparent; color:var(--text-muted); }
  .results { padding:14px; overflow:auto; }
  .msg { color:var(--text-muted); font-size:13px; text-align:center; padding:24px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:10px; }
  .hit { border:1px solid var(--border); border-radius:8px; overflow:hidden; padding:0; background:var(--bg); cursor:pointer; aspect-ratio:1; }
  .hit:hover { border-color:var(--accent); }
  .hit img { width:100%; height:100%; object-fit:cover; display:block; }
</style>
