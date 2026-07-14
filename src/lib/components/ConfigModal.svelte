<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { configOpen, theme } from '../shell';
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
</style>
