<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import FolderOpen from 'lucide-svelte/icons/folder-open';
  import { listBackups } from '../io/backupService';
  import { openBackupFolder, backupEnabled, backupDir } from '../../../shell';
  import { openPath } from '../../../fileService';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();
  let items = $state<{ name: string; path: string }[]>([]);
  let loading = $state(false);

  $effect(() => {
    if (!open) return;
    loading = true;
    listBackups().then((b) => { items = b; loading = false; });
  });

  function restore(path: string) { onClose(); openPath(path); }
</script>

{#if open}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Backups">
    <div class="modal">
      <header class="head">
        <span class="title">Backups</span>
        <button type="button" class="close" aria-label="close" onclick={onClose}><X size={16} /></button>
      </header>
      <div class="body">
        {#if !$backupEnabled || !$backupDir}
          <p class="empty">Auto-backup is off. Turn it on and pick a folder in Settings.</p>
        {:else if loading}
          <p class="empty">Loading…</p>
        {:else if items.length}
          <ul class="log">
            {#each items as it (it.path)}
              <li>
                <span class="name" title={it.path}>{it.name}</span>
                <button type="button" class="mini" onclick={() => restore(it.path)}>Open</button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty">No backups found for this project yet.</p>
        {/if}
      </div>
      <footer class="foot">
        {#if $backupDir}
          <button type="button" class="ghost" onclick={openBackupFolder}><FolderOpen size={14} /> Open folder</button>
        {/if}
        <button type="button" class="ghost" onclick={onClose}>Close</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:70; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(460px,94vw); max-height:80vh; display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); }
  .title { font-weight:600; }
  .close { border:none; background:transparent; color:var(--text-muted); }
  .body { padding:8px 14px; overflow:auto; }
  .log { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
  .log li { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:6px 0;
    border-bottom:1px solid var(--border); font-size:13px; }
  .log li:last-child { border-bottom:none; }
  .name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .empty { color:var(--text-muted); font-size:13px; margin:8px 0; }
  .foot { display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .foot button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    border-radius:6px; padding:6px 12px; font:inherit; background:transparent; color:var(--text); }
  .mini { border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text);
    font:inherit; font-size:12px; padding:3px 10px; cursor:pointer; }
</style>
