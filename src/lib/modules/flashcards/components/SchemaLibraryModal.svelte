<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Plus from 'lucide-svelte/icons/plus';
  import Download from 'lucide-svelte/icons/download';
  import Upload from 'lucide-svelte/icons/upload';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import { open as openDialog, save as saveDialog, confirm } from '@tauri-apps/plugin-dialog';
  import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
  import { get } from 'svelte/store';
  import {
    schemaLibrary, schemaLibraryOpen, insertLibrarySchema, removeFromLibrary,
    importSchemaFileText, addSchemaToLibrary, project, activeSchemaId,
    renameLibraryEntry, setLibraryEntryFields, updateLibraryEntryFromSchema,
  } from '../stores';
  import { serializeSchemaExport, type SchemaLibraryEntry } from '../io/schemaIO';
  import { viewLabel } from '../cardMapping';
  import { labelLocaleValue, setLabelLocale } from '../lib/card-render';
  import { uid, type SchemaField, type Schema } from '../model';
  import { showToast } from '../../../shell';

  function close() { schemaLibraryOpen.set(false); }

  const activeSchema = $derived($project.schemas.find((s) => s.id === $activeSchemaId) ?? null);

  // ── Detail / edit state (per expanded entry) ─────────────────────────────
  let expandedId = $state<string | null>(null);
  let loadedId: string | null = null;
  let nameDraft = $state('');
  let fieldsDraft = $state<SchemaField[]>([]);

  const expandedEntry = $derived(expandedId ? ($schemaLibrary.find((e) => e.id === expandedId) ?? null) : null);

  // Load drafts once per expanded target; guard so store-version bumps (from our own commits)
  // don't clobber in-progress edits.
  $effect(() => {
    void $schemaLibrary;
    if (expandedId === loadedId) return;
    loadedId = expandedId;
    if (expandedId === null) { nameDraft = ''; fieldsDraft = []; return; }
    const e = get(schemaLibrary).find((x) => x.id === expandedId);
    nameDraft = e?.name ?? '';
    fieldsDraft = e ? structuredClone(e.schema.fields) : [];
  });

  function toggle(id: string) { expandedId = expandedId === id ? null : id; }

  function commitName() {
    if (expandedId) renameLibraryEntry(expandedId, nameDraft);
  }
  function commitFields() {
    if (expandedId) setLibraryEntryFields(expandedId, $state.snapshot(fieldsDraft) as SchemaField[]);
  }
  function addField() {
    fieldsDraft = [...fieldsDraft, { id: uid('fld'), key: '', label: '', type: 'text', multilingual: true }];
    commitFields();
  }
  function removeField(i: number) {
    fieldsDraft = fieldsDraft.filter((_, idx) => idx !== i);
    commitFields();
  }
  function patchField(i: number, patch: Partial<SchemaField>) {
    fieldsDraft = fieldsDraft.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    commitFields();
  }

  function asSchema(e: SchemaLibraryEntry): Schema {
    return { id: '', name: e.schema.name, fields: e.schema.fields, cardTemplates: e.schema.cardTemplates };
  }

  function onUpdateFromCurrent() {
    if (!expandedId) return;
    const sid = get(activeSchemaId);
    if (!sid) return;
    updateLibraryEntryFromSchema(expandedId, sid);
    const e = get(schemaLibrary).find((x) => x.id === expandedId);
    if (e) { nameDraft = e.name; fieldsDraft = structuredClone(e.schema.fields); }
    showToast(`Updated '${e?.name ?? 'schema'}' from the current schema`);
  }

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
      if (expandedId === entry.id) expandedId = null;
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
            <div class="entry" class:expanded={expandedId === entry.id}>
              <div class="entry-row">
                <button type="button" class="entry-toggle" aria-label="toggle details"
                  aria-expanded={expandedId === entry.id} onclick={() => toggle(entry.id)}>
                  {#if expandedId === entry.id}<ChevronDown size={15} />{:else}<ChevronRight size={15} />{/if}
                  <span class="entry-info">
                    <span class="entry-name">{entry.name}</span>
                    <span class="entry-meta">{meta(entry)}</span>
                  </span>
                </button>
                <div class="entry-actions">
                  <button type="button" onclick={() => onInsert(entry)}><Plus size={13} /> Insert</button>
                  <button type="button" aria-label="export" title="Export…" onclick={() => onExport(entry)}><Download size={13} /></button>
                  <button type="button" class="danger" aria-label="delete" title="Delete" onclick={() => onDelete(entry)}><Trash2 size={13} /></button>
                </div>
              </div>

              {#if expandedId === entry.id}
                <div class="detail">
                  <label class="drow">
                    <span class="lbl">Name</span>
                    <input class="name-input" aria-label="entry name" bind:value={nameDraft} oninput={commitName} />
                  </label>

                  <div class="fields-head">
                    <span class="lbl">Fields</span>
                    <button type="button" class="add" onclick={addField}><Plus size={13} /> Add field</button>
                  </div>
                  {#each fieldsDraft as f, i (f.id)}
                    <div class="field-row">
                      <input aria-label="field key" placeholder="key" bind:value={f.key} oninput={commitFields} />
                      <div class="label-locales">
                        {#each $project.locales as loc (loc)}
                          <div class="loc-row">
                            <span class="loc-tag">{loc.toUpperCase()}</span>
                            <input class="txt" aria-label={`field label ${loc}`} placeholder="label"
                              value={labelLocaleValue(f.label, loc, $project.locales[0])}
                              oninput={(e) => patchField(i, { label: setLabelLocale(f.label, loc, (e.target as HTMLInputElement).value, $project.locales[0]) })} />
                          </div>
                        {/each}
                      </div>
                      <select aria-label="field type" value={f.type}
                        onchange={(e) => patchField(i, { type: (e.target as HTMLSelectElement).value as SchemaField['type'] })}>
                        <option value="text">text</option>
                        <option value="text-long">text-long</option>
                        <option value="image">image</option>
                      </select>
                      <label class="ml" title="multilingual">
                        <input type="checkbox" checked={f.multilingual !== false}
                          disabled={f.type === 'image'}
                          onchange={(e) => patchField(i, { multilingual: (e.target as HTMLInputElement).checked })} /> ML
                      </label>
                      <button type="button" aria-label="remove field" onclick={() => removeField(i)}><X size={13} /></button>
                    </div>
                  {/each}

                  <span class="lbl views-lbl">Views</span>
                  {#if expandedEntry && expandedEntry.schema.cardTemplates.length}
                    {#each expandedEntry.schema.cardTemplates as t, i (t.id)}
                      <div class="view-row">
                        <span class="view-name">{viewLabel(t, asSchema(expandedEntry), i, $project.activeLocale)}</span>
                        <span class="view-meta">{t.layout} · {t.fields?.length ?? 'all'} field{t.fields?.length === 1 ? '' : 's'}</span>
                      </div>
                    {/each}
                  {:else}
                    <p class="view-empty">No saved views.</p>
                  {/if}

                  <div class="detail-foot">
                    <button type="button" class="update" disabled={!activeSchema} onclick={onUpdateFromCurrent}>
                      <RefreshCw size={13} /> Update from current schema
                    </button>
                  </div>
                </div>
              {/if}
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
  .entry { border:1px solid var(--border); border-radius:8px; }
  .entry.expanded { border-color:var(--accent); }
  .entry-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 12px; }
  .entry-toggle { display:flex; align-items:center; gap:8px; flex:1; min-width:0; border:none;
    background:transparent; color:var(--text); text-align:left; font:inherit; padding:0; cursor:pointer; }
  .entry-toggle :global(svg) { flex-shrink:0; color:var(--text-muted); }
  .entry-info { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .entry-name { font-weight:600; }
  .entry-meta { font-size:11px; color:var(--text-muted); }
  .entry-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .entry-actions button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:5px 9px; font:inherit; font-size:12px; }
  .entry-actions button:hover { background:var(--accent-weak); color:var(--accent); }
  .entry-actions button.danger:hover { color:var(--danger); border-color:var(--danger-border); background:var(--danger-weak); }

  .detail { display:flex; flex-direction:column; gap:10px; padding:4px 12px 12px;
    border-top:1px solid var(--border); }
  .lbl { font-size:12px; font-weight:600; color:var(--text-muted); }
  .drow { display:flex; flex-direction:column; gap:5px; }
  .name-input { padding:7px 9px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; }
  .fields-head { display:flex; align-items:center; justify-content:space-between; }
  .add { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border); background:transparent;
    color:var(--text); border-radius:6px; padding:4px 9px; font:inherit; font-size:12px; }
  .add:hover { background:var(--accent-weak); color:var(--accent); }
  .field-row { display:flex; align-items:flex-start; gap:6px; }
  .field-row input:not([type]), .field-row select { padding:5px 7px;
    border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; font-size:13px; }
  .field-row > input { flex:1; min-width:0; }
  .field-row > button { border:1px solid var(--border); background:transparent; color:var(--text-muted);
    border-radius:6px; padding:4px 7px; font:inherit; margin-top:2px; }
  .field-row > button:hover { color:var(--danger); border-color:var(--danger-border); background:var(--danger-weak); }
  .label-locales { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
  .loc-row { display:flex; align-items:center; gap:6px; }
  .loc-tag { font-size:10px; font-weight:600; color:var(--accent); min-width:20px; flex:none; }
  .ml { display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--text-muted); margin-top:5px; }
  .views-lbl { margin-top:2px; }
  .view-row { display:flex; align-items:center; justify-content:space-between; gap:10px;
    border:1px solid var(--border); border-radius:6px; padding:5px 9px; font-size:12px; }
  .view-name { font-weight:600; }
  .view-meta { color:var(--text-muted); font-size:11px; }
  .view-empty { color:var(--text-muted); font-size:12px; margin:0; }
  .detail-foot { display:flex; justify-content:flex-end; }
  .update { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border); background:transparent;
    color:var(--text); border-radius:6px; padding:5px 10px; font:inherit; font-size:12px; }
  .update:hover:not(:disabled) { background:var(--accent-weak); color:var(--accent); }
  .update:disabled { opacity:.5; cursor:default; }
</style>
