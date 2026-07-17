<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { configOpen, theme, userName, setUserName,
    backupEnabled, backupDir, backupKeep, setBackupEnabled, setBackupKeep,
    chooseBackupDir, openBackupFolder } from '../shell';
  import type { Theme } from '../theme';

  function close() { configOpen.set(false); }
  function onWindowKeydown(e: KeyboardEvent) { if ($configOpen && e.key === 'Escape') close(); }
  function setTheme(t: Theme) { theme.set(t); }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if $configOpen}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    aria-label="close settings"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
  ></div>
  <div class="modal" role="dialog" aria-label="Settings" aria-modal="true">
    <header>
      <span>Settings</span>
      <button class="x" aria-label="close" onclick={close}><X size={18} /></button>
    </header>
    <div class="body">
      <p class="label">Your name</p>
      <input
        class="text"
        type="text"
        aria-label="your name"
        placeholder="e.g. Tung"
        value={$userName}
        oninput={(e) => setUserName((e.target as HTMLInputElement).value)}
      />
      <p class="hint">Shown in the edit history and file lock, so teammates know who made a change.</p>
      <p class="label">Theme</p>
      <label class="opt">
        <input type="radio" name="theme" checked={$theme === 'system'} onchange={() => setTheme('system')} />
        System
      </label>
      <label class="opt">
        <input type="radio" name="theme" checked={$theme === 'light'} onchange={() => setTheme('light')} />
        Light
      </label>
      <label class="opt">
        <input type="radio" name="theme" checked={$theme === 'dark'} onchange={() => setTheme('dark')} />
        Dark
      </label>

      <p class="label">Backups</p>
      <label class="opt">
        <input type="checkbox" aria-label="enable backups"
          checked={$backupEnabled}
          onchange={(e) => setBackupEnabled((e.target as HTMLInputElement).checked)} />
        Save a backup copy on every save
      </label>
      {#if $backupEnabled}
        <div class="folder-row">
          <span class="folder-path" title={$backupDir ?? ''}>{$backupDir ?? 'No folder chosen'}</span>
          <button type="button" class="mini" onclick={chooseBackupDir}>Choose…</button>
          {#if $backupDir}<button type="button" class="mini" onclick={openBackupFolder}>Open</button>{/if}
        </div>
        <label class="keep-row">
          Keep latest
          <input class="keep" type="number" min="1" aria-label="keep count"
            value={$backupKeep}
            onchange={(e) => setBackupKeep(Number((e.target as HTMLInputElement).value))} />
          backups
        </label>
        <p class="hint">Tip: use a local folder outside your Drive/Dropbox, so backups aren't part of the sync.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:1000; border:none; }
  .modal {
    position:fixed; z-index:1001; top:50%; left:50%; transform:translate(-50%,-50%);
    width:min(360px,92vw); background:var(--surface); color:var(--text); border:1px solid var(--border);
    border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.35); padding:16px;
    display:flex; flex-direction:column; gap:8px;
  }
  header { display:flex; justify-content:space-between; align-items:center; font-weight:600; margin-bottom:4px; }
  .x { border:none; background:transparent; color:var(--text-muted); cursor:pointer; }
  .label { font-size:12px; color:var(--text-muted); margin:6px 0 2px; }
  .opt { display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer; }
  .text { width:100%; box-sizing:border-box; padding:6px 8px; border:1px solid var(--border);
    border-radius:6px; background:var(--bg); color:var(--text); font:inherit; }
  .hint { font-size:11px; color:var(--text-muted); margin:2px 0 6px; }
  .folder-row { display:flex; align-items:center; gap:6px; margin:4px 0; }
  .folder-path { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-size:12px; color:var(--text-muted); }
  .mini { border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text);
    font:inherit; font-size:12px; padding:3px 8px; cursor:pointer; }
  .keep-row { display:flex; align-items:center; gap:6px; font-size:13px; margin:4px 0; }
  .keep { width:64px; padding:4px 6px; border:1px solid var(--border); border-radius:6px;
    background:var(--bg); color:var(--text); font:inherit; }
</style>
