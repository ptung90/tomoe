<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Clipboard from 'lucide-svelte/icons/clipboard';
  import ClipboardPaste from 'lucide-svelte/icons/clipboard-paste';
  import Layers from 'lucide-svelte/icons/layers';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import {
    project, selectedRecordId, selectRecord, addRecord,
    schemaEditorOpen, importRecords,
  } from '../stores';
  import { showToast } from '../../../shell';
  import type { RecordItem, Schema } from '../model';
  import { stripImagesForCopy } from '../lib/copyStrip';
  import LocaleBar from './LocaleBar.svelte';
  import EmptyState from './EmptyState.svelte';
  import AiGenerateModal from './AiGenerateModal.svelte';
  import AutofillImagesModal from './AutofillImagesModal.svelte';

  let aiSchemaId = $state<string | null>(null);
  let autofillSchemaId = $state<string | null>(null);

  function rowLabel(rec: RecordItem, schema: Schema): string {
    const f = schema.fields.find((x) => x.type !== 'image');
    if (!f) return '(untitled)';
    const v = rec.fields[f.key];
    const s = v && typeof v === 'object' ? (v[$project.activeLocale] ?? '') : (typeof v === 'string' ? v : '');
    return s.trim() || '(untitled)';
  }
  const recordsBySchema = $derived((id: string) => $project.records.filter((r) => r.schemaId === id));
  const canAutofill = $derived((schema: Schema) =>
    schema.fields.some((f) => f.type === 'image') && schema.fields.some((f) => f.type !== 'image'));

  async function copyJson(schemaId: string) {
    const schema = $project.schemas.find((s) => s.id === schemaId);
    const imageKeys = new Set((schema?.fields ?? []).filter((f) => f.type === 'image').map((f) => f.key));
    const recs = stripImagesForCopy($project.records.filter((r) => r.schemaId === schemaId), imageKeys);
    try {
      await navigator.clipboard.writeText(JSON.stringify(recs, null, 2));
      showToast('Records copied as JSON');
    } catch { showToast('Could not access clipboard', 'error'); }
  }
  async function pasteJson(schemaId: string) {
    let incoming: RecordItem[];
    try {
      const txt = await navigator.clipboard.readText();
      const parsed = JSON.parse(txt);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      incoming = parsed as RecordItem[];
    } catch { showToast('Clipboard is not a records JSON array', 'error'); return; }
    // Merge is the safe default: it overlays text edits onto matching records by id
    // and keeps existing images (a copied backup has "[image]" where a picture was stripped).
    const doMerge = await confirm(
      `Paste ${incoming.length} record(s).\n\nOK = Merge (apply text edits into matching records, keep existing images)\nCancel = other options`,
      { title: 'Paste records', kind: 'info' },
    );
    if (doMerge) {
      importRecords(schemaId, incoming, 'merge');
      showToast('Records merged');
      return;
    }
    const overwrite = await confirm(
      `OK = Overwrite this schema's records\nCancel = Append as new records`,
      { title: 'Paste records', kind: 'warning' },
    );
    importRecords(schemaId, incoming, overwrite ? 'overwrite' : 'append');
    showToast('Records pasted');
  }
</script>

<div class="list">
  <div class="list-top">
    <LocaleBar />
    <button type="button" class="new-schema" onclick={() => schemaEditorOpen.set('__new__')}>
      <Plus size={14} /> Schema
    </button>
  </div>

  {#if $project.schemas.length === 0}
    {#snippet createAction()}
      <button type="button" class="empty-cta" onclick={() => schemaEditorOpen.set('__new__')}>Create a schema</button>
    {/snippet}
    <EmptyState icon={Layers} title="No schemas yet"
      hint="A schema defines the fields your records share. Create one to start."
      action={createAction} />
  {:else}
    {#each $project.schemas as schema (schema.id)}
      <section class="schema">
        <header class="schema-head">
          <span class="schema-name">{schema.name}</span>
          <span class="count">{recordsBySchema(schema.id).length}</span>
          <div class="schema-actions">
            <button type="button" aria-label="edit schema" title="Edit schema"
              onclick={() => schemaEditorOpen.set(schema.id)}><Pencil size={13} /></button>
            <button type="button" aria-label="copy json" title="Copy records JSON"
              onclick={() => copyJson(schema.id)}><Clipboard size={13} /></button>
            <button type="button" aria-label="paste json" title="Paste records JSON"
              onclick={() => pasteJson(schema.id)}><ClipboardPaste size={13} /></button>
            {#if canAutofill(schema)}
              <button type="button" aria-label="auto-fill images" title="Auto-fill images"
                onclick={() => autofillSchemaId = schema.id}><WandSparkles size={13} /></button>
            {/if}
            <button type="button" aria-label="ai generate" title="Generate records with AI"
              onclick={() => aiSchemaId = schema.id}><Sparkles size={13} /></button>
          </div>
        </header>
        <ul class="records">
          {#each recordsBySchema(schema.id) as rec (rec.id)}
            <li>
              <button type="button" class="rec" class:sel={$selectedRecordId === rec.id}
                onclick={() => selectRecord(rec.id)}>{rowLabel(rec, schema)}</button>
            </li>
          {/each}
        </ul>
        <button type="button" class="add-rec" onclick={() => addRecord(schema.id)}>
          <Plus size={13} /> Add record
        </button>
      </section>
    {/each}
  {/if}

  {#if aiSchemaId}
    <AiGenerateModal schemaId={aiSchemaId} onClose={() => aiSchemaId = null} />
  {/if}

  {#if autofillSchemaId}
    {@const s = $project.schemas.find((x) => x.id === autofillSchemaId)}
    {#if s}
      <AutofillImagesModal
        schema={s}
        records={$project.records.filter((r) => r.schemaId === autofillSchemaId)}
        onClose={() => (autofillSchemaId = null)} />
    {/if}
  {/if}
</div>

<style>
  .list { height:100%; overflow:auto; padding:10px; display:flex; flex-direction:column; gap:12px; background:var(--sidebar); }
  .list-top { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
  .new-schema, .add-rec { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:4px 9px; font:inherit; font-size:12px;
    transition:background .12s ease, color .12s ease; }
  .new-schema:hover, .add-rec:hover { background:var(--accent-weak); color:var(--accent); }
  .new-schema:focus-visible, .add-rec:focus-visible, .rec:focus-visible, .schema-actions button:focus-visible {
    outline:2px solid var(--accent); outline-offset:1px; }
  .schema { display:flex; flex-direction:column; gap:6px; }
  .schema-head { display:flex; align-items:center; gap:8px; }
  .schema-name { font-weight:600; font-size:13px; }
  .count { font-size:11px; color:var(--text-muted); background:var(--accent-weak); border-radius:10px; padding:0 7px; }
  .schema-actions { margin-left:auto; display:flex; gap:2px; }
  .schema-actions button { border:none; background:transparent; color:var(--text-muted); padding:3px; border-radius:5px; }
  .schema-actions button:hover { background:var(--accent-weak); color:var(--accent); }
  .records { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px; }
  .rec { width:100%; text-align:left; border:none; background:transparent; color:var(--text);
    border-radius:6px; padding:6px 9px; font:inherit; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    transition:background .12s ease, color .12s ease; }
  .rec:hover { background:var(--accent-weak); }
  .rec.sel { background:var(--accent); color:#fff; font-weight:600; }
  .empty-cta { border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:600;
    border-radius:6px; padding:6px 14px; font:inherit; font-size:12px; cursor:pointer; }
  .empty-cta:hover { opacity:.92; }
  .empty-cta:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
