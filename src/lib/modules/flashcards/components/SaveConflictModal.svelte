<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { saveConflict } from '../stores';
  import { resolveOverwrite, resolveSaveCopy, resolveReload, resolveCancel } from '../io/saveService';
</script>

{#if $saveConflict}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="File changed on disk">
    <div class="modal">
      <header class="head">
        <span class="title">⚠ File changed on disk</span>
        <button type="button" class="close" aria-label="close" onclick={resolveCancel}><X size={16} /></button>
      </header>
      <div class="body">
        <p>
          This file was changed by someone else (or another device) since you opened it —
          probably a sync that hasn't merged. Saving now would overwrite their version.
        </p>
        <p class="muted">Choose how to resolve it:</p>
      </div>
      <footer class="foot">
        <button type="button" class="ghost" onclick={resolveCancel}>Cancel</button>
        <button type="button" class="ghost" onclick={resolveReload}>Discard mine, load theirs</button>
        <button type="button" class="ghost" onclick={resolveSaveCopy}>Save as copy…</button>
        <button type="button" class="danger" onclick={resolveOverwrite}>Overwrite</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:70; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(480px,94vw); display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); }
  .title { display:inline-flex; align-items:center; gap:8px; font-weight:600; }
  .close { border:none; background:transparent; color:var(--text-muted); }
  .body { padding:14px; display:flex; flex-direction:column; gap:8px; }
  .body p { margin:0; font-size:13px; }
  .muted { color:var(--text-muted); }
  .foot { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .foot button { border:1px solid var(--border); border-radius:6px; padding:6px 12px; font:inherit; }
  .ghost { background:transparent; color:var(--text); }
  .danger { background:var(--danger, #dc2626); border-color:var(--danger, #dc2626); color:#fff; }
</style>
