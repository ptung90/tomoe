<script lang="ts">
  import FolderOpen from 'lucide-svelte/icons/folder-open';
  import X from 'lucide-svelte/icons/x';
  import { MODULES } from '../modules/registry';
  import { setActiveModule } from '../shell';
  import { pickOpen, openPath } from '../fileService';
  import { recentFiles, removeRecent, clearRecent } from '../recentFiles';

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
    {#if $recentFiles.length}
      <div class="recent">
        <div class="recent-head"><span>Recent</span>
          <button type="button" class="clear" onclick={clearRecent}>Clear</button></div>
        <ul>
          {#each $recentFiles as r (r.path)}
            <li>
              <button type="button" class="recent-item" title={r.path} onclick={() => openPath(r.path)}>
                <span class="rname">{r.name}</span><span class="rpath">{r.path}</span>
              </button>
              <button type="button" class="rm" aria-label={`remove ${r.name}`} title="Remove"
                onclick={() => removeRecent(r.path)}><X size={13} /></button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
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
  .recent { width:100%; margin-top:6px; display:flex; flex-direction:column; gap:6px; }
  .recent-head { display:flex; align-items:center; justify-content:space-between; font-size:12px; color:var(--text-muted); }
  .clear { border:none; background:transparent; color:var(--text-muted); font:inherit; font-size:12px; cursor:pointer; padding:2px 4px; border-radius:5px; }
  .clear:hover { background:var(--accent-weak); color:var(--accent); }
  .recent ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px; }
  .recent li { display:flex; align-items:center; gap:4px; }
  .recent-item { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:1px;
    border:none; background:transparent; color:var(--text); border-radius:6px; padding:5px 8px; font:inherit; cursor:pointer; text-align:left; }
  .recent-item:hover { background:var(--accent-weak); }
  .rname { font-size:13px; }
  .rpath { font-size:11px; color:var(--text-muted); max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rm { border:none; background:transparent; color:var(--text-muted); padding:4px; border-radius:5px; cursor:pointer; flex:0 0 auto; }
  .rm:hover { background:var(--accent-weak); color:var(--accent); }
  .recent-item:focus-visible, .rm:focus-visible, .clear:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
</style>
