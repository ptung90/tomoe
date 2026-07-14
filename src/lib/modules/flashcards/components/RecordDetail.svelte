<script lang="ts">
  import Copy from 'lucide-svelte/icons/copy';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { project, selectedRecordId, setField, deleteRecord, duplicateRecord } from '../stores';
  import { keyedDebounce } from '../../../debounce';
  import RecordField from './RecordField.svelte';

  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((s) => s.id === record.schemaId) ?? null) : null);

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
</script>

{#if record && schema}
  <div class="detail">
    <header class="detail-header">
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
  <div class="empty">
    <p>No record selected. Pick one on the left, or add a new record.</p>
  </div>
{/if}

<style>
  .detail { height:100%; display:flex; flex-direction:column; min-height:0; }
  .detail-header { display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; border-bottom:1px solid var(--border); background:var(--surface); }
  .detail-title { font-weight:600; }
  .actions { display:flex; gap:6px; }
  .actions button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:4px 9px; font:inherit; }
  .actions button:hover { background:var(--accent-weak); color:var(--accent); }
  .actions .danger:hover { background:#fee; color:#b91c1c; }
  .detail-body { flex:1; overflow:auto; padding:14px; display:flex; flex-direction:column; gap:14px; }
  .hint, .empty p { color:var(--text-muted); font-size:13px; }
  .empty { height:100%; display:flex; align-items:center; justify-content:center; padding:24px; text-align:center; }
</style>
