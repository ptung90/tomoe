<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { project, addLocale, removeLocale, setActiveLocale } from '../stores';

  let newLocale = $state('');
  function submit(e: Event) {
    e.preventDefault();
    const l = newLocale.trim().toLowerCase();
    if (l) addLocale(l);
    newLocale = '';
  }
</script>

<div class="localebar">
  {#each $project.locales as l (l)}
    <span class="chip" class:active={$project.activeLocale === l}>
      <button type="button" class="pick" onclick={() => setActiveLocale(l)}>{l.toUpperCase()}</button>
      {#if $project.locales.length > 1}
        <button type="button" class="rm" aria-label={`remove ${l}`} onclick={() => removeLocale(l)}>
          <X size={11} />
        </button>
      {/if}
    </span>
  {/each}
  <form onsubmit={submit}>
    <input placeholder="add locale…" bind:value={newLocale} size="8" />
  </form>
</div>

<style>
  .localebar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .chip { display:inline-flex; align-items:center; border:1px solid var(--border); border-radius:6px; overflow:hidden; }
  .chip.active { border-color:var(--accent); }
  .pick { border:none; background:transparent; color:var(--text); font:inherit; font-size:12px; padding:3px 7px; }
  .chip.active .pick { background:var(--accent); color:#fff; font-weight:600; }
  .rm { border:none; background:transparent; color:var(--text-muted); display:inline-flex; padding:2px 4px; }
  .rm:hover { color:var(--danger); }
  .localebar input { border:1px solid var(--border); border-radius:6px; padding:3px 7px;
    background:var(--bg); color:var(--text); font:inherit; font-size:12px; }
</style>
