<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Printer from 'lucide-svelte/icons/printer';
  import FileDown from 'lucide-svelte/icons/file-down';
  import { save as saveDialog } from '@tauri-apps/plugin-dialog';
  import { writeFile } from '@tauri-apps/plugin-fs';
  import { project, printSelection } from '../stores';
  import { deriveAutoTemplate, viewLabel, schemaTitleKey } from '../cardMapping';
  import { collectPrintSheets } from '../lib/printCards';
  import { exportCardsPdf, pdfFileName, pdfStamp } from '../lib/pdfExport';
  import { resolveLocale } from '../lib/card-render';
  import { showToast } from '../../../shell';

  let { open, onClose }: { open: boolean; onClose: () => void } = $props();

  // Per-schema views + records to choose from.
  const groups = $derived($project.schemas.map((s) => ({
    schema: s,
    views: (s.cardTemplates.length ? s.cardTemplates : [deriveAutoTemplate(s)]),
    records: $project.records.filter((r) => r.schemaId === s.id),
  })));
  const allViewIds = $derived(new Set(groups.flatMap((g) => g.views.map((v) => v.id))));
  const allRecordIds = $derived(new Set(groups.flatMap((g) => g.records.map((r) => r.id))));

  let selViews = $state<Set<string>>(new Set());
  let selRecords = $state<Set<string>>(new Set());
  let exporting = $state(false);

  // Default to "everything selected" each time the modal opens.
  $effect(() => {
    if (open) { selViews = new Set(allViewIds); selRecords = new Set(allRecordIds); }
  });

  const selection = $derived({ views: selViews, records: selRecords });
  const pageCount = $derived(open ? collectPrintSheets($project, selection).length : 0);

  function recordLabel(rec: (typeof groups)[number]['records'][number], schema: (typeof groups)[number]['schema']): string {
    const key = schemaTitleKey(schema);
    const t = key ? resolveLocale(rec.fields[key], $project.activeLocale).replace(/<[^>]+>/g, '').trim() : '';
    return t || rec.id;
  }
  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }

  async function doPrint() {
    if (!pageCount) return;
    printSelection.set(selection);
    onClose();
    // Let the DOM settle with the filtered PrintView before opening the print dialog.
    setTimeout(() => { window.print(); printSelection.set(null); }, 50);
  }

  async function doPdf() {
    if (!pageCount || exporting) return;
    exporting = true;
    try {
      const bytes = await exportCardsPdf($project, selection);
      if (!bytes) { showToast('Nothing selected to export', 'error'); return; }
      const path = await saveDialog({ defaultPath: pdfFileName($project.projectName, pdfStamp(new Date())), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (!path) return;
      await writeFile(path, bytes);
      showToast('Exported PDF');
      onClose();
    } catch (e) {
      showToast(`Export failed: ${e instanceof Error ? e.message : String(e) || 'unknown error'}`, 'error');
    } finally { exporting = false; }
  }
</script>

{#if open}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Export / print">
    <div class="modal">
      <header class="head">
        <span class="title">Export / print</span>
        <button type="button" class="close" aria-label="close" onclick={onClose}><X size={16} /></button>
      </header>
      <div class="body">
        {#each groups as g (g.schema.id)}
          <section class="group">
            {#if groups.length > 1}<h3 class="schema-name">{g.schema.name}</h3>{/if}

            <div class="sub">
              <div class="sub-head">
                <span>Views</span>
                <span class="allnone">
                  <button type="button" onclick={() => selViews = new Set([...selViews, ...g.views.map((v) => v.id)])}>All</button>
                  <button type="button" onclick={() => { const ids = new Set(g.views.map((v) => v.id)); selViews = new Set([...selViews].filter((x) => !ids.has(x))); }}>None</button>
                </span>
              </div>
              <div class="chips">
                {#each g.views as v, i (v.id)}
                  <label class="chip" class:on={selViews.has(v.id)}>
                    <input type="checkbox" checked={selViews.has(v.id)} onchange={() => selViews = toggle(selViews, v.id)} />
                    {viewLabel(v, g.schema, i, $project.activeLocale)}
                  </label>
                {/each}
              </div>
            </div>

            <div class="sub">
              <div class="sub-head">
                <span>Records ({g.records.length})</span>
                <span class="allnone">
                  <button type="button" onclick={() => selRecords = new Set([...selRecords, ...g.records.map((r) => r.id)])}>All</button>
                  <button type="button" onclick={() => { const ids = new Set(g.records.map((r) => r.id)); selRecords = new Set([...selRecords].filter((x) => !ids.has(x))); }}>None</button>
                </span>
              </div>
              <div class="records">
                {#each g.records as r (r.id)}
                  <label class="rec" class:on={selRecords.has(r.id)}>
                    <input type="checkbox" checked={selRecords.has(r.id)} onchange={() => selRecords = toggle(selRecords, r.id)} />
                    <span class="rec-name">{recordLabel(r, g.schema)}</span>
                  </label>
                {/each}
              </div>
            </div>
          </section>
        {/each}
      </div>
      <footer class="foot">
        <span class="count">{pageCount} page{pageCount === 1 ? '' : 's'}</span>
        <span class="spacer"></span>
        <button type="button" class="ghost" onclick={onClose}>Cancel</button>
        <button type="button" class="ghost" disabled={!pageCount} onclick={doPrint}><Printer size={14} /> Print</button>
        <button type="button" class="primary" disabled={!pageCount || exporting} onclick={doPdf}>
          <FileDown size={14} /> {exporting ? 'Exporting…' : 'Save PDF'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:70; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(520px,94vw); max-height:84vh; display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); }
  .title { font-weight:600; }
  .close { border:none; background:transparent; color:var(--text-muted); }
  .body { padding:12px 14px; overflow:auto; display:flex; flex-direction:column; gap:16px; }
  .schema-name { font-size:13px; margin:0 0 6px; }
  .group { display:flex; flex-direction:column; gap:10px; }
  .sub-head { display:flex; align-items:center; justify-content:space-between; font-size:11px; font-weight:700;
    letter-spacing:.05em; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px; }
  .allnone button { border:none; background:transparent; color:var(--accent); font:inherit; font-size:11px; cursor:pointer; padding:0 4px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border); border-radius:6px;
    padding:3px 8px; font-size:12px; cursor:pointer; }
  .chip.on { border-color:var(--accent); background:var(--accent-weak); }
  .records { display:flex; flex-direction:column; gap:1px; max-height:200px; overflow:auto; border:1px solid var(--border);
    border-radius:8px; padding:4px; }
  .rec { display:flex; align-items:center; gap:8px; padding:3px 6px; border-radius:5px; font-size:13px; cursor:pointer; }
  .rec:hover { background:var(--accent-weak); }
  .rec-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  input[type=checkbox] { accent-color:var(--accent); cursor:pointer; }
  .foot { display:flex; align-items:center; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .count { font-size:12px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
  .spacer { flex:1; }
  .foot button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border); border-radius:6px;
    padding:6px 12px; font:inherit; }
  .ghost { background:transparent; color:var(--text); }
  .primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  .foot button:disabled { opacity:.5; cursor:default; }
</style>
