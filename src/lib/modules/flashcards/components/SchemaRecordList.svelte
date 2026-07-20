<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Clipboard from 'lucide-svelte/icons/clipboard';
  import ClipboardPaste from 'lucide-svelte/icons/clipboard-paste';
  import Layers from 'lucide-svelte/icons/layers';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import EllipsisVertical from 'lucide-svelte/icons/ellipsis-vertical';
  import Braces from 'lucide-svelte/icons/braces';
  import Download from 'lucide-svelte/icons/download';
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
  import EmbedImagesModal from './EmbedImagesModal.svelte';
  import RecordsJsonModal from './RecordsJsonModal.svelte';
  import { remoteImageRefs } from '../lib/embedImages';

  let aiSchemaId = $state<string | null>(null);
  let autofillSchemaId = $state<string | null>(null);
  let embedSchemaId = $state<string | null>(null);
  let jsonSchemaId = $state<string | null>(null);
  let menuFor = $state<string | null>(null);
  function act(fn: () => void): void { menuFor = null; fn(); }

  // The row label is plain-text: record fields may hold markdown/HTML (headings, <small>, <br>),
  // which would otherwise show as literal markup in the list. Strip tags + common md markers.
  function stripMarkup(s: string): string {
    return s.replace(/<[^>]*>/g, ' ').replace(/[#*_`~]/g, '').replace(/\s+/g, ' ').trim();
  }

  function rowLabel(rec: RecordItem, schema: Schema): string {
    const f = schema.fields.find((x) => x.type !== 'image');
    if (!f) return '(untitled)';
    const v = rec.fields[f.key];
    const s = v && typeof v === 'object' ? (v[$project.activeLocale] ?? '') : (typeof v === 'string' ? v : '');
    return stripMarkup(s) || '(untitled)';
  }
  const recordsBySchema = $derived((id: string) => $project.records.filter((r) => r.schemaId === id));
  const canAutofill = $derived((schema: Schema) =>
    schema.fields.some((f) => f.type === 'image') && schema.fields.some((f) => f.type !== 'image'));
  // Show "Embed image URLs" only when at least one record has a remote http(s) URL to download.
  const canEmbed = $derived((schema: Schema) =>
    remoteImageRefs(recordsBySchema(schema.id), schema.fields.filter((f) => f.type === 'image').map((f) => f.key)).length > 0);

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
            <button type="button" class="kebab" aria-label="schema actions" title="Actions"
              aria-haspopup="menu" aria-expanded={menuFor === schema.id}
              onclick={() => (menuFor = menuFor === schema.id ? null : schema.id)}><EllipsisVertical size={15} /></button>
            {#if menuFor === schema.id}
              <div class="menu" role="menu">
                <button type="button" role="menuitem" onclick={() => act(() => schemaEditorOpen.set(schema.id))}><Pencil size={13} /> Edit schema</button>
                <button type="button" role="menuitem" onclick={() => act(() => (jsonSchemaId = schema.id))}><Braces size={13} /> Edit records JSON…</button>
                <div class="menu-sep"></div>
                <button type="button" role="menuitem" onclick={() => act(() => copyJson(schema.id))}><Clipboard size={13} /> Copy records JSON</button>
                <button type="button" role="menuitem" onclick={() => act(() => pasteJson(schema.id))}><ClipboardPaste size={13} /> Paste records JSON</button>
                {#if canAutofill(schema)}
                  <button type="button" role="menuitem" onclick={() => act(() => (autofillSchemaId = schema.id))}><WandSparkles size={13} /> Auto-fill images</button>
                {/if}
                {#if canEmbed(schema)}
                  <button type="button" role="menuitem" onclick={() => act(() => (embedSchemaId = schema.id))}><Download size={13} /> Embed image URLs</button>
                {/if}
                <button type="button" role="menuitem" onclick={() => act(() => (aiSchemaId = schema.id))}><Sparkles size={13} /> Generate with AI</button>
              </div>
            {/if}
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

  {#if menuFor}
    <button type="button" class="menu-backdrop" aria-label="close menu" onclick={() => (menuFor = null)}></button>
  {/if}

  {#if jsonSchemaId}
    <RecordsJsonModal schemaId={jsonSchemaId} onClose={() => (jsonSchemaId = null)} />
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

  {#if embedSchemaId}
    {@const s = $project.schemas.find((x) => x.id === embedSchemaId)}
    {#if s}
      <EmbedImagesModal
        schema={s}
        records={$project.records.filter((r) => r.schemaId === embedSchemaId)}
        onClose={() => (embedSchemaId = null)} />
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
  .schema-actions { margin-left:auto; position:relative; }
  .kebab { border:none; background:transparent; color:var(--text-muted); padding:3px; border-radius:5px;
    display:inline-flex; cursor:pointer; }
  .kebab:hover, .kebab[aria-expanded="true"] { background:var(--accent-weak); color:var(--accent); }
  .menu { position:absolute; top:100%; right:0; margin-top:4px; z-index:20; min-width:190px;
    background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:4px;
    box-shadow:0 8px 24px rgba(0,0,0,0.18); display:flex; flex-direction:column; gap:1px; }
  .menu button { display:flex; align-items:center; gap:8px; width:100%; text-align:left; border:none;
    background:transparent; color:var(--text); padding:7px 9px; border-radius:6px; font:inherit; cursor:pointer; }
  .menu button:hover { background:var(--accent-weak); color:var(--accent); }
  .menu-sep { height:1px; background:var(--border); margin:3px 2px; }
  .menu-backdrop { position:fixed; inset:0; z-index:10; background:transparent; border:none; padding:0; cursor:default; }
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
