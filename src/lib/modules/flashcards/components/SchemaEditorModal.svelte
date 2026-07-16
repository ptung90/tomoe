<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { project, schemaEditorOpen, addSchema, updateSchema, deleteSchema } from '../stores';
  import { labelLocaleValue, setLabelLocale } from '../lib/card-render';
  import { uid, type SchemaField } from '../model';

  let name = $state('');
  let fields = $state<SchemaField[]>([]);
  let target = $state<string | '__new__' | null>(null);

  // Load a draft whenever the editor target changes.
  $effect(() => {
    const open = $schemaEditorOpen;
    if (open === target) return;
    target = open;
    if (open === null) return;
    if (open === '__new__') { name = ''; fields = []; return; }
    const s = $project.schemas.find((x) => x.id === open);
    name = s?.name ?? '';
    fields = s ? structuredClone(s.fields) : [];
  });

  function addField() {
    fields = [...fields, { id: uid('fld'), key: '', label: '', type: 'text', multilingual: true }];
  }
  function removeField(i: number) { fields = fields.filter((_, idx) => idx !== i); }
  function moveField(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    fields = next;
  }
  function patchField(i: number, patch: Partial<SchemaField>) {
    fields = fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
  }

  function close() { schemaEditorOpen.set(null); }
  /** True when every locale of a label (or a plain string label) is blank. Local to this
   *  modal's save-time defensiveness — a field must always have SOME label. */
  function isLabelBlank(label: SchemaField['label']): boolean {
    if (typeof label === 'object') return Object.values(label).every((v) => !v || !v.trim());
    return !label || !label.trim();
  }
  function save() {
    // Fill blank keys/labels defensively so records can address fields. A blank label backfills
    // to the key/`Field N`; otherwise the full LocalizedText label is persisted as-is so every
    // locale the user typed survives (no collapse to a single primary-locale string).
    const clean = fields.map((f, i) => {
      const key = f.key.trim() || `field${i + 1}`;
      const label = isLabelBlank(f.label) ? (f.key.trim() || `Field ${i + 1}`) : f.label;
      return { ...f, key, label };
    });
    if (target === '__new__') {
      const id = addSchema(name.trim() || 'Untitled');
      updateSchema(id, { fields: clean });
    } else if (target) {
      updateSchema(target, { name: name.trim() || 'Untitled', fields: clean });
    }
    close();
  }
  async function onDeleteSchema() {
    if (target && target !== '__new__') {
      if (await confirm('Delete this schema and all its records?', { title: 'Delete schema', kind: 'warning' })) {
        deleteSchema(target);
        close();
      }
    }
  }
</script>

{#if $schemaEditorOpen !== null}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <header class="modal-head">
        <span>{target === '__new__' ? 'New schema' : 'Edit schema'}</span>
        <button type="button" aria-label="close" onclick={close}><X size={16} /></button>
      </header>

      <div class="modal-body">
        <label class="row">
          <span class="lbl">Schema name</span>
          <input bind:value={name} />
        </label>

        <div class="fields-head">
          <span class="lbl">Fields</span>
          <button type="button" class="add" onclick={addField}><Plus size={13} /> Add field</button>
        </div>

        {#each fields as f, i (f.id)}
          <div class="field-row">
            <input aria-label="field key" placeholder="key" bind:value={f.key}
              oninput={(e) => patchField(i, { key: (e.target as HTMLInputElement).value })} />
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
            <button type="button" aria-label="move up" onclick={() => moveField(i, -1)}>↑</button>
            <button type="button" aria-label="move down" onclick={() => moveField(i, 1)}>↓</button>
            <button type="button" aria-label="remove field" onclick={() => removeField(i)}><X size={13} /></button>
          </div>
        {/each}
      </div>

      <footer class="modal-foot">
        {#if target !== '__new__'}
          <button type="button" class="danger" onclick={onDeleteSchema}><Trash2 size={14} /> Delete schema</button>
        {/if}
        <span class="spacer"></span>
        <button type="button" onclick={close}>Cancel</button>
        <button type="button" class="primary" onclick={save}>Save</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center;
    justify-content:center; z-index:50; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border);
    border-radius:12px; width:min(640px,92vw); max-height:88vh; display:flex; flex-direction:column; }
  .modal-head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px;
    border-bottom:1px solid var(--border); font-weight:600; }
  .modal-head button { border:none; background:transparent; color:var(--text-muted); }
  .modal-body { padding:14px 16px; overflow:auto; display:flex; flex-direction:column; gap:12px; }
  .lbl { font-size:12px; font-weight:600; color:var(--text-muted); }
  .row { display:flex; flex-direction:column; gap:5px; }
  .row input { padding:7px 9px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; }
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
  .label-locales { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
  .loc-row { display:flex; align-items:center; gap:6px; }
  .loc-tag { font-size:10px; font-weight:600; color:var(--accent); min-width:20px; flex:none; }
  .ml { display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--text-muted); margin-top:5px; }
  .modal-foot { display:flex; align-items:center; gap:8px; padding:12px 16px; border-top:1px solid var(--border); }
  .spacer { flex:1; }
  .modal-foot button { border:1px solid var(--border); background:transparent; color:var(--text);
    border-radius:6px; padding:6px 14px; font:inherit; }
  .modal-foot .primary { background:var(--accent); color:#fff; border-color:var(--accent); font-weight:600; }
  .modal-foot .danger { color:var(--danger); border-color:var(--danger-border); display:inline-flex; align-items:center; gap:5px; }
</style>
