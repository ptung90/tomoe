<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Plus from 'lucide-svelte/icons/plus';
  import Download from 'lucide-svelte/icons/download';
  import Upload from 'lucide-svelte/icons/upload';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { open as openDialog, save as saveDialog, confirm } from '@tauri-apps/plugin-dialog';
  import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
  import {
    schemaLibrary, schemaLibraryOpen, insertLibrarySchema, removeFromLibrary,
    importSchemaFileText, addSchemaToLibrary, project, activeSchemaId,
  } from '../stores';
  import { serializeSchemaExport, type SchemaLibraryEntry } from '../io/schemaIO';
  import { showToast } from '../../../shell';

  function close() { schemaLibraryOpen.set(false); }

  const activeSchema = $derived($project.schemas.find((s) => s.id === $activeSchemaId) ?? null);

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function meta(entry: SchemaLibraryEntry): string {
    const f = entry.schema.fields.length;
    const v = entry.schema.cardTemplates.length || 1;
    return `${f} field${f === 1 ? '' : 's'} · ${v} view${v === 1 ? '' : 's'} · Added ${formatDate(entry.addedAt)}`;
  }

  function onAddCurrent() {
    if (!activeSchema) return;
    addSchemaToLibrary(activeSchema.id);
    showToast(`Added '${activeSchema.name}' to the schema library`);
  }

  async function onImport() {
    try {
      const path = await openDialog({ multiple: false, filters: [{ name: 'Tomoe Schema', extensions: ['schema.json'] }] });
      if (typeof path !== 'string') return;
      const text = await readTextFile(path);
      const res = importSchemaFileText(text);
      if (res.ok) showToast(`Added '${res.name}' to the schema library`);
      else showToast(res.error ?? 'Not a valid Tomoe schema file', 'error');
    } catch (e) {
      showToast(`Could not import: ${(e as Error).message}`, 'error');
    }
  }

  function onInsert(entry: SchemaLibraryEntry) {
    insertLibrarySchema(entry.id);
    showToast(`Inserted '${entry.name}' into the project`);
  }

  async function onExport(entry: SchemaLibraryEntry) {
    const path = await saveDialog({ defaultPath: `${entry.name}.schema.json`, filters: [{ name: 'Tomoe Schema', extensions: ['schema.json'] }] });
    if (!path) return;
    try {
      await writeTextFile(path, serializeSchemaExport(entry.schema, entry.settings));
      showToast('Exported');
    } catch (e) {
      showToast(`Could not export: ${(e as Error).message}`, 'error');
    }
  }

  async function onDelete(entry: SchemaLibraryEntry) {
    if (await confirm(`Delete '${entry.name}' from the schema library?`, { title: 'Delete schema', kind: 'warning' })) {
      removeFromLibrary(entry.id);
    }
  }
</script>

{#if $schemaLibraryOpen}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <header class="modal-head">
        <span>Schema library</span>
        <button type="button" aria-label="close" onclick={close}><X size={16} /></button>
      </header>

      <div class="modal-toolbar">
        <button type="button" onclick={onImport}><Upload size={13} /> Import from file…</button>
        <button type="button" disabled={!activeSchema} onclick={onAddCurrent}><Plus size={13} /> Add current schema</button>
      </div>

      <div class="modal-body">
        {#if $schemaLibrary.length === 0}
          <p class="empty">No schemas saved yet. Use "Add current schema" or "Import from file…" above.</p>
        {:else}
          {#each $schemaLibrary as entry (entry.id)}
            <div class="entry">
              <div class="entry-info">
                <span class="entry-name">{entry.name}</span>
                <span class="entry-meta">{meta(entry)}</span>
              </div>
              <div class="entry-actions">
                <button type="button" onclick={() => onInsert(entry)}><Plus size={13} /> Insert</button>
                <button type="button" aria-label="export" title="Export…" onclick={() => onExport(entry)}><Download size={13} /></button>
                <button type="button" class="danger" aria-label="delete" title="Delete" onclick={() => onDelete(entry)}><Trash2 size={13} /></button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center;
    justify-content:center; z-index:50; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border);
    border-radius:12px; width:min(560px,92vw); max-height:88vh; display:flex; flex-direction:column; }
  .modal-head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px;
    border-bottom:1px solid var(--border); font-weight:600; }
  .modal-head button { border:none; background:transparent; color:var(--text-muted); }
  .modal-toolbar { display:flex; gap:8px; padding:12px 16px; border-bottom:1px solid var(--border); }
  .modal-toolbar button { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:5px 10px; font:inherit; font-size:12px; }
  .modal-toolbar button:hover:not(:disabled) { background:var(--accent-weak); color:var(--accent); }
  .modal-toolbar button:disabled { opacity:.5; cursor:default; }
  .modal-body { padding:8px 16px 16px; overflow:auto; display:flex; flex-direction:column; gap:8px; }
  .empty { color:var(--text-muted); font-size:13px; padding:16px 0; }
  .entry { display:flex; align-items:center; justify-content:space-between; gap:10px;
    border:1px solid var(--border); border-radius:8px; padding:9px 12px; }
  .entry-info { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .entry-name { font-weight:600; }
  .entry-meta { font-size:11px; color:var(--text-muted); }
  .entry-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .entry-actions button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:5px 9px; font:inherit; font-size:12px; }
  .entry-actions button:hover { background:var(--accent-weak); color:var(--accent); }
  .entry-actions button.danger:hover { color:var(--danger); border-color:var(--danger-border); background:transparent; }
</style>
