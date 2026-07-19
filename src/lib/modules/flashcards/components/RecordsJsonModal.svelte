<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Replace from 'lucide-svelte/icons/replace';
  import { project, importRecords } from '../stores';
  import { showToast } from '../../../shell';
  import { stripImagesForCopy } from '../lib/copyStrip';
  import type { RecordItem } from '../model';

  let { schemaId, onClose }: { schemaId: string; onClose: () => void } = $props();

  const schema = $derived($project.schemas.find((s) => s.id === schemaId));

  // Show the schema's records as JSON, with base64 images collapsed to "[image]" so the text is
  // editable. Applying with 'merge' keeps the real images (matched by record id) — see importRecords.
  function initialText(): string {
    const s = $project.schemas.find((x) => x.id === schemaId);
    const imageKeys = new Set((s?.fields ?? []).filter((f) => f.type === 'image').map((f) => f.key));
    const recs = stripImagesForCopy($project.records.filter((r) => r.schemaId === schemaId), imageKeys);
    return JSON.stringify(recs, null, 2);
  }

  let text = $state(initialText());
  let find = $state('');
  let replace = $state('');
  let error = $state('');

  function replaceAll(): void {
    if (!find) return;
    const count = text.split(find).length - 1;
    if (!count) { showToast('No matches', 'error'); return; }
    text = text.split(find).join(replace);
    showToast(`Replaced ${count}`);
  }

  function apply(): void {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch (e) { error = `Invalid JSON: ${(e as Error).message}`; return; }
    if (!Array.isArray(parsed)) { error = 'JSON must be an array of records.'; return; }
    importRecords(schemaId, parsed as RecordItem[], 'merge');
    showToast('Records updated');
    onClose();
  }

  function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') onClose(); }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop" role="button" tabindex="-1" aria-label="Close"
  onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}></div>
<div class="modal" role="dialog" aria-modal="true" aria-label="Edit records JSON">
    <header>
      <span class="title">Edit records JSON — {schema?.name ?? ''}</span>
      <button type="button" class="icon" aria-label="close" onclick={onClose}><X size={16} /></button>
    </header>

    <div class="find">
      <input type="text" placeholder="Find" bind:value={find} spellcheck="false" />
      <span class="arrow">→</span>
      <input type="text" placeholder="Replace" bind:value={replace} spellcheck="false" />
      <button type="button" class="repl" disabled={!find} onclick={replaceAll}>
        <Replace size={13} /> Replace all
      </button>
    </div>

    <textarea class="json" bind:value={text} spellcheck="false"
      oninput={() => (error = '')}></textarea>

    {#if error}<p class="err">{error}</p>{/if}
    <p class="note">
      Images show as <code>"[image]"</code> and are kept. Edits are matched to records by
      <code>id</code>; new ids are added. Deleting a record here won't remove it — use the list.
    </p>

    <footer>
      <button type="button" onclick={onClose}>Cancel</button>
      <button type="button" class="primary" onclick={apply}>Apply</button>
    </footer>
</div>

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:60; }
  .modal { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:61;
    background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(760px,calc(100vw - 48px)); max-height:90vh; display:flex; flex-direction:column; gap:10px;
    padding:14px 16px; box-shadow:0 12px 40px rgba(0,0,0,0.3); }
  header { display:flex; align-items:center; gap:8px; }
  .title { font-weight:600; flex:1; min-width:0; }
  button.icon { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:2px; }
  .find { display:flex; align-items:center; gap:6px; }
  .find input { flex:1; min-width:0; padding:6px 8px; border:1px solid var(--border); border-radius:6px;
    background:var(--bg); color:var(--text); font:inherit; }
  .arrow { color:var(--text-muted); }
  .repl { display:inline-flex; align-items:center; gap:5px; padding:6px 10px; border:1px solid var(--border);
    border-radius:6px; background:var(--bg); color:var(--text); font:inherit; white-space:nowrap; }
  .repl:hover:not(:disabled) { background:var(--accent-weak); color:var(--accent); border-color:var(--accent); }
  .repl:disabled { opacity:0.5; }
  .json { flex:1; min-height:340px; resize:vertical; padding:9px 11px; border:1px solid var(--border);
    border-radius:8px; background:var(--bg); color:var(--text);
    font-family:ui-monospace,'Cascadia Code',Consolas,monospace; font-size:12.5px; line-height:1.45; }
  .err { color:#dc2626; font-size:12.5px; margin:0; }
  .note { color:var(--text-muted); font-size:11.5px; margin:0; line-height:1.4; }
  .note code { background:var(--accent-weak); padding:0 4px; border-radius:4px; }
  footer { display:flex; justify-content:flex-end; gap:8px; }
  footer button { padding:7px 14px; border:1px solid var(--border); border-radius:7px; background:var(--bg);
    color:var(--text); font:inherit; cursor:pointer; }
  footer button.primary { background:var(--accent); color:#fff; border-color:var(--accent); }
</style>
