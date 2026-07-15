<script lang="ts">
  import Copy from 'lucide-svelte/icons/copy';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import SquarePen from 'lucide-svelte/icons/square-pen';
  import ChevronLeft from 'lucide-svelte/icons/chevron-left';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { project, selectedRecordId, setField, deleteRecord, duplicateRecord, selectAdjacentRecord } from '../stores';
  import { keyedDebounce } from '../../../debounce';
  import RecordField from './RecordField.svelte';
  import EmptyState from './EmptyState.svelte';

  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((s) => s.id === record.schemaId) ?? null) : null);
  // Sibling records (same schema, list order) for Prev/Next navigation.
  const siblings = $derived(record ? $project.records.filter((r) => r.schemaId === record.schemaId) : []);
  const idx = $derived(record ? siblings.findIndex((r) => r.id === record.id) : -1);

  const debounced = keyedDebounce(
    (rid: string, key: string, val: string, locale?: string) => setField(rid, key, val, locale),
    300,
  );
  function onFieldChange(key: string, val: string, locale?: string) {
    if (!record) return;
    debounced.call(`${record.id}|${key}|${locale ?? ''}`, record.id, key, val, locale);
  }
  // Flush pending edits when switching away from a record so nothing is lost.
  let lastId: string | null = null;
  $effect(() => {
    const id = $selectedRecordId;
    if (id !== lastId) { debounced.flushAll(); lastId = id; }
  });

  async function onDelete() {
    if (!record) return;
    debounced.flushAll();
    if (await confirm('Delete this record?', { title: 'Delete record', kind: 'warning' })) {
      deleteRecord(record.id);
    }
  }

  function onDuplicate() {
    if (!record) return;
    debounced.flushAll();
    duplicateRecord(record.id);
  }

  function goto(delta: number) {
    debounced.flushAll();
    selectAdjacentRecord(delta);
  }
</script>

{#if record && schema}
  <div class="detail">
    <header class="detail-header">
      <div class="nav">
        <button type="button" class="icon" aria-label="previous record" title="Previous record"
          disabled={idx <= 0} onclick={() => goto(-1)}><ChevronLeft size={16} /></button>
        <span class="pos">{idx + 1}/{siblings.length}</span>
        <button type="button" class="icon" aria-label="next record" title="Next record"
          disabled={idx < 0 || idx >= siblings.length - 1} onclick={() => goto(1)}><ChevronRight size={16} /></button>
      </div>
      <span class="detail-title">Edit record</span>
      <div class="actions">
        <button type="button" onclick={onDuplicate} title="Duplicate record">
          <Copy size={15} /> Duplicate
        </button>
        <button type="button" class="danger" onclick={onDelete} title="Delete record">
          <Trash2 size={15} />
        </button>
      </div>
    </header>
    <div class="detail-body">
      {#key record.id}
        {#each schema.fields as f (f.id)}
          <RecordField
            field={f}
            value={record.fields[f.key] ?? ''}
            locales={$project.locales}
            onChange={(val, locale) => onFieldChange(f.key, val, locale)} />
        {/each}
        {#if schema.fields.length === 0}
          <p class="hint">This schema has no fields yet. Edit the schema to add some.</p>
        {/if}
      {/key}
    </div>
  </div>
{:else}
  <EmptyState icon={SquarePen} title="No record selected"
    hint="Select a record on the left to edit it, or add a new one." />
{/if}

<style>
  .detail { height:100%; display:flex; flex-direction:column; min-height:0; }
  .detail-header { display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; border-bottom:1px solid var(--border); background:var(--surface); }
  .detail-title { font-weight:600; }
  .nav { display:flex; align-items:center; gap:4px; }
  .nav .icon { display:inline-flex; align-items:center; border:1px solid var(--border); background:transparent;
    color:var(--text); border-radius:6px; padding:4px; cursor:pointer; transition:background .12s ease, color .12s ease; }
  .nav .icon:hover:not(:disabled) { background:var(--accent-weak); color:var(--accent); }
  .nav .icon:disabled { opacity:.4; cursor:default; }
  .nav .icon:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .pos { font-size:11px; color:var(--text-muted); min-width:34px; text-align:center; }
  .actions { display:flex; gap:6px; }
  .actions button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:4px 9px; font:inherit;
    transition:background .12s ease, color .12s ease; }
  .actions button:hover { background:var(--accent-weak); color:var(--accent); }
  .actions .danger:hover { background:var(--danger-weak); color:var(--danger); }
  .actions button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .detail-body { flex:1; overflow:auto; padding:14px; display:flex; flex-direction:column; gap:14px; }
  .hint { color:var(--text-muted); font-size:13px; }
</style>
