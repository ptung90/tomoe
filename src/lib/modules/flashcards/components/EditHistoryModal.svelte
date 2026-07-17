<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { project } from '../stores';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

  // Newest first for display.
  const entries = $derived([...($project.editLog ?? [])].reverse());

  function fmt(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  }
</script>

{#if open}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Edit history">
    <div class="modal">
      <header class="head">
        <span class="title">Edit history</span>
        <button type="button" class="close" aria-label="close" onclick={onClose}><X size={16} /></button>
      </header>
      <div class="body">
        {#if entries.length}
          <ul class="log">
            {#each entries as e, i (i)}
              <li><span class="by">{e.by}</span><span class="at">{fmt(e.at)}</span></li>
            {/each}
          </ul>
        {:else}
          <p class="empty">No edits recorded yet.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:70; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(440px,94vw); max-height:80vh; display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); }
  .title { font-weight:600; }
  .close { border:none; background:transparent; color:var(--text-muted); }
  .body { padding:8px 14px 14px; overflow:auto; }
  .log { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
  .log li { display:flex; justify-content:space-between; gap:12px; padding:6px 0; border-bottom:1px solid var(--border); font-size:13px; }
  .log li:last-child { border-bottom:none; }
  .by { font-weight:600; }
  .at { color:var(--text-muted); white-space:nowrap; }
  .empty { color:var(--text-muted); font-size:13px; margin:8px 0; }
</style>
