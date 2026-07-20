<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Save from 'lucide-svelte/icons/save';
  import Upload from 'lucide-svelte/icons/upload';
  import Download from 'lucide-svelte/icons/download';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Wand from 'lucide-svelte/icons/wand-sparkles';
  import { open as openDialog, save as saveDialog, confirm } from '@tauri-apps/plugin-dialog';
  import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
  import {
    stylePresetLibrary, stylePresetOpen, saveStylePreset, deleteStylePreset,
    renameStylePreset, updateStylePreset, importStylePresetText, applyStylePreset,
  } from '../stores';
  import { serializeStylePreset, type StylePresetEntry } from '../io/stylePresetIO';
  import { showToast } from '../../../shell';

  function close() { stylePresetOpen.set(false); }

  let nameDraft = $state('');
  // Which entry's apply-options panel is open, and its two flags (both default on).
  let applyingId = $state<string | null>(null);
  let syncViews = $state(true);
  let clearCards = $state(true);

  function onSaveCurrent() {
    const name = nameDraft.trim() || 'Preset';
    saveStylePreset(name);
    nameDraft = '';
    showToast(`Saved preset '${name}'`);
  }

  function openApply(id: string) {
    applyingId = applyingId === id ? null : id;
    syncViews = true; clearCards = true;
  }
  function confirmApply(entry: StylePresetEntry) {
    applyStylePreset(entry.preset, { syncViews, clearCards });
    applyingId = null;
    showToast(`Applied '${entry.name}'`);
    close();
  }

  async function onImport() {
    try {
      const path = await openDialog({ multiple: false, filters: [{ name: 'Tomoe Style Preset', extensions: ['tomoestyle.json', 'json'] }] });
      if (typeof path !== 'string') return;
      const res = importStylePresetText(await readTextFile(path));
      if (res.ok) showToast(`Imported preset '${res.name}'`);
      else showToast(res.error ?? 'Not a valid Tomoe style preset file', 'error');
    } catch (e) {
      showToast(`Could not import: ${(e as Error).message}`, 'error');
    }
  }

  async function onExport(entry: StylePresetEntry) {
    const path = await saveDialog({ defaultPath: `${entry.name}.tomoestyle.json`, filters: [{ name: 'Tomoe Style Preset', extensions: ['tomoestyle.json'] }] });
    if (!path) return;
    try {
      await writeTextFile(path, serializeStylePreset(entry.name, entry.preset));
      showToast('Exported');
    } catch (e) {
      showToast(`Could not export: ${(e as Error).message}`, 'error');
    }
  }

  function onUpdate(entry: StylePresetEntry) {
    updateStylePreset(entry.id);
    showToast(`Updated '${entry.name}' from the current style`);
  }

  async function onDelete(entry: StylePresetEntry) {
    if (await confirm(`Delete preset '${entry.name}'?`, { title: 'Delete preset', kind: 'warning' })) {
      if (applyingId === entry.id) applyingId = null;
      deleteStylePreset(entry.id);
    }
  }

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
</script>

{#if $stylePresetOpen}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <header class="modal-head">
        <span>Style presets</span>
        <button type="button" aria-label="close" onclick={close}><X size={16} /></button>
      </header>

      <div class="modal-toolbar">
        <input class="name-input" aria-label="New preset name" placeholder="New preset name…" bind:value={nameDraft} />
        <button type="button" onclick={onSaveCurrent}><Save size={13} /> Save current</button>
        <button type="button" onclick={onImport}><Upload size={13} /> Import…</button>
      </div>

      <div class="modal-body">
        {#if $stylePresetLibrary.length === 0}
          <p class="empty">No presets yet. Style a card, then "Save current" to capture the look (colours, fonts, spacing, image — not border or page).</p>
        {:else}
          {#each $stylePresetLibrary as entry (entry.id)}
            <div class="entry" class:expanded={applyingId === entry.id}>
              <div class="entry-row">
                <span class="entry-info">
                  <input class="entry-name" aria-label={`Rename ${entry.name}`} value={entry.name}
                    oninput={(e) => renameStylePreset(entry.id, (e.target as HTMLInputElement).value)} />
                  <span class="entry-meta">Added {formatDate(entry.addedAt)}</span>
                </span>
                <div class="entry-actions">
                  <button type="button" onclick={() => openApply(entry.id)}><Wand size={13} /> Apply</button>
                  <button type="button" aria-label="update from current style" title="Update from current Global style"
                    onclick={() => onUpdate(entry)}><RefreshCw size={13} /></button>
                  <button type="button" aria-label="export" title="Export…" onclick={() => onExport(entry)}><Download size={13} /></button>
                  <button type="button" class="danger" aria-label="delete" title="Delete" onclick={() => onDelete(entry)}><Trash2 size={13} /></button>
                </div>
              </div>

              {#if applyingId === entry.id}
                <div class="apply-panel">
                  <label class="opt"><input type="checkbox" bind:checked={syncViews} /> Sync views</label>
                  <label class="opt"><input type="checkbox" bind:checked={clearCards} /> Clear per-card overrides</label>
                  <p class="opt-hint">Writes style to Global; keeps border, layout &amp; paper size.</p>
                  <div class="apply-foot">
                    <button type="button" class="ghost" onclick={() => (applyingId = null)}>Cancel</button>
                    <button type="button" class="primary" onclick={() => confirmApply(entry)}>Apply preset</button>
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
    border-radius:12px; width:min(520px,92vw); max-height:88vh; display:flex; flex-direction:column; }
  .modal-head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px;
    border-bottom:1px solid var(--border); font-weight:600; }
  .modal-head button { border:none; background:transparent; color:var(--text-muted); }
  .modal-toolbar { display:flex; gap:8px; padding:12px 16px; border-bottom:1px solid var(--border); }
  .modal-toolbar .name-input { flex:1; min-width:0; padding:5px 9px; border:1px solid var(--border);
    border-radius:6px; background:var(--bg); color:var(--text); font:inherit; font-size:13px; }
  .modal-toolbar button { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:5px 10px; font:inherit; font-size:12px; white-space:nowrap; }
  .modal-toolbar button:hover { background:var(--accent-weak); color:var(--accent); }
  .modal-body { padding:8px 16px 16px; overflow:auto; display:flex; flex-direction:column; gap:8px; }
  .empty { color:var(--text-muted); font-size:13px; padding:16px 0; line-height:1.5; }
  .entry { border:1px solid var(--border); border-radius:8px; }
  .entry.expanded { border-color:var(--accent); }
  .entry-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 12px; }
  .entry-info { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
  .entry-name { font-weight:600; border:1px solid transparent; background:transparent; color:var(--text);
    font:inherit; border-radius:5px; padding:3px 5px; }
  .entry-name:hover, .entry-name:focus { border-color:var(--border); background:var(--bg); outline:none; }
  .entry-meta { font-size:11px; color:var(--text-muted); padding:0 5px; }
  .entry-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .entry-actions button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:5px 9px; font:inherit; font-size:12px; }
  .entry-actions button:hover { background:var(--accent-weak); color:var(--accent); }
  .entry-actions button.danger:hover { color:var(--danger); border-color:var(--danger-border); background:var(--danger-weak); }
  .apply-panel { display:flex; flex-direction:column; gap:8px; padding:10px 12px 12px; border-top:1px solid var(--border); }
  .opt { display:flex; align-items:center; gap:8px; font-size:13px; }
  .opt input { accent-color:var(--accent); }
  .opt-hint { margin:0; font-size:11px; color:var(--text-muted); }
  .apply-foot { display:flex; justify-content:flex-end; gap:8px; }
  .apply-foot button { border:1px solid var(--border); border-radius:6px; padding:6px 14px; font:inherit; font-size:13px; }
  .apply-foot .ghost { background:transparent; color:var(--text); }
  .apply-foot .primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:600; }
</style>
