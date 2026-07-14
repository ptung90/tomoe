<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { getAtPath, type JsonValue } from '../jsonModel';
  import { data, bigEditorPath, editValue, closeBigEditor } from '../stores';
  import { pathExists } from '../pathUtils';

  const path = $derived($bigEditorPath);
  const current = $derived(
    path !== null && $data !== null && pathExists($data, path)
      ? String(getAtPath($data, path) ?? '')
      : '',
  );
  const fieldName = $derived(path && path.length ? String(path[path.length - 1]) : '');

  function onInput(e: Event) {
    if (path !== null) editValue(path, (e.target as HTMLTextAreaElement).value);
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeBigEditor();
  }
</script>

{#if path !== null}
  <div
    class="backdrop"
    role="button"
    tabindex="-1"
    aria-label="close editor"
    onclick={closeBigEditor}
    onkeydown={onKeydown}
  ></div>
  <div class="dialog" role="dialog" aria-label={`Edit ${fieldName}`}>
    <header>
      <span class="title">Edit <b>{fieldName}</b></span>
      <button class="close" aria-label="close" onclick={closeBigEditor}><X size={18} /></button>
    </header>
    <!-- svelte-ignore a11y_autofocus -->
    <textarea value={current} oninput={onInput} onkeydown={onKeydown} autofocus></textarea>
    <footer><button class="done" onclick={closeBigEditor}>Done</button></footer>
  </div>
{/if}

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:1000; border:none; }
  .dialog { position:fixed; z-index:1001; top:50%; left:50%; transform:translate(-50%,-50%);
    width:min(680px, 92vw); max-height:82vh; display:flex; flex-direction:column;
    background:var(--surface); color:var(--text); border:1px solid var(--border);
    border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.35); overflow:hidden; }
  header { display:flex; align-items:center; justify-content:space-between;
    padding:12px 16px; border-bottom:1px solid var(--border); }
  .title { color:var(--text-muted); }
  .title b { color:var(--text); }
  .close { display:flex; border:none; background:transparent; color:var(--text-muted); padding:4px; border-radius:6px; }
  .close:hover { color:var(--accent); background:var(--accent-weak); }
  textarea { flex:1; min-height:240px; resize:none; border:none; outline:none;
    padding:16px; font:inherit; line-height:1.55; color:var(--text); background:var(--surface); }
  footer { display:flex; justify-content:flex-end; padding:12px 16px; border-top:1px solid var(--border); }
  .done { border:none; background:var(--accent); color:#fff; font-weight:600;
    border-radius:8px; padding:7px 18px; }
</style>
