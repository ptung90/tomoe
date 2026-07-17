<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { openLock } from '../stores';
  import { relativeTime } from '../lib/editLog';
  import { resolveOpenReadOnly, resolveEditAnyway, resolveCloseLocked } from '../io/lockService';
</script>

{#if $openLock}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="File is locked">
    <div class="modal">
      <header class="head">
        <span class="title">🔒 Someone else is editing</span>
        <button type="button" class="close" aria-label="close" onclick={resolveOpenReadOnly}><X size={16} /></button>
      </header>
      <div class="body">
        <p><strong>{$openLock.by}</strong> has this file open (locked {relativeTime($openLock.at, Date.now())}).</p>
        <p class="muted">Editing now risks a sync conflict that overwrites their work. Open read-only to look without saving.</p>
      </div>
      <footer class="foot">
        <button type="button" class="ghost" onclick={resolveCloseLocked}>Don't open</button>
        <button type="button" class="danger" onclick={resolveEditAnyway}>Edit anyway</button>
        <button type="button" class="primary" onclick={resolveOpenReadOnly}>Open read-only</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:70; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(460px,94vw); display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); }
  .title { font-weight:600; }
  .close { border:none; background:transparent; color:var(--text-muted); }
  .body { padding:14px; display:flex; flex-direction:column; gap:8px; }
  .body p { margin:0; font-size:13px; }
  .muted { color:var(--text-muted); }
  .foot { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .foot button { border:1px solid var(--border); border-radius:6px; padding:6px 12px; font:inherit; }
  .ghost { background:transparent; color:var(--text); }
  .primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  .danger { background:var(--danger); border-color:var(--danger); color:#fff; }
</style>
