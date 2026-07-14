<script lang="ts">
  import FolderOpen from 'lucide-svelte/icons/folder-open';
  import { MODULES } from '../modules/registry';
  import { setActiveModule } from '../shell';
  import { pickOpen } from '../fileService';

  function startNew(id: string) {
    const mod = MODULES.find((m) => m.id === id);
    mod?.newDoc();
    setActiveModule(id);
  }
</script>

<div class="start">
  <div class="card">
    <h1>Tomoe</h1>
    <p class="subtitle">Choose what to create, or open an existing file.</p>
    <div class="actions">
      {#each MODULES as mod (mod.id)}
        <button class="btn" onclick={() => startNew(mod.id)}>New {mod.label}</button>
      {/each}
      <button class="btn btn-ghost" onclick={pickOpen}><FolderOpen size={16} /> Open file…</button>
    </div>
  </div>
</div>

<style>
  .start { flex:1; display:flex; align-items:center; justify-content:center; background:var(--bg); min-height:0; }
  .card {
    background:var(--surface); border:1px solid var(--border); border-radius:16px;
    padding:40px 48px; display:flex; flex-direction:column; align-items:center; gap:8px;
    box-shadow:0 10px 30px rgba(0,0,0,.08); min-width:280px;
  }
  h1 { margin:0; color:var(--text); }
  .subtitle { margin:0 0 8px; color:var(--text-muted); font-size:13px; text-align:center; }
  .actions { display:flex; flex-direction:column; gap:10px; width:100%; }
  .btn {
    display:inline-flex; align-items:center; justify-content:center; gap:8px;
    border:1px solid var(--border); border-radius:8px; padding:10px 18px;
    background:var(--accent); color:#fff; font-weight:600; font:inherit; cursor:pointer;
  }
  .btn:hover { opacity:.92; }
  .btn-ghost { background:transparent; color:var(--text); }
  .btn-ghost:hover { background:var(--accent-weak); color:var(--accent); }
</style>
