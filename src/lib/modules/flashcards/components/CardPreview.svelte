<script lang="ts">
  import '../lib/card-render.css';
  import Palette from 'lucide-svelte/icons/palette';
  import ImageIcon from 'lucide-svelte/icons/image';
  import { project, selectedRecordId, setSettings, setTemplateLayout } from '../stores';
  import { deriveAutoTemplate, recordToCard, chunkRecords } from '../cardMapping';
  import { buildCardHTML, buildSheetHTML, getPaperPx, sheetLayout } from '../lib/card-render';
  import { LAYOUTS } from '../lib/layouts';
  import { zoomStep } from '../lib/zoom';
  import StyleControls from './StyleControls.svelte';
  import EmptyState from './EmptyState.svelte';
  import type { Card } from '../model';

  let paneW = $state(440);
  let showStyle = $state(false);
  let mode = $state<'card' | 'sheet'>('card');
  // null = auto-fit; a number = explicit user zoom (Ctrl/⌘ + wheel). Double-click resets.
  let userZoom = $state<number | null>(null);
  let dragging = $state(false);

  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((s) => s.id === record.schemaId) ?? null) : null);
  const template = $derived(schema ? (schema.cardTemplates[0] ?? deriveAutoTemplate(schema)) : null);
  const orient = $derived(template?.orientation || $project.settings.orientation);
  const lay = $derived(template ? sheetLayout(template, $project.settings.paperSize, orient) : null);

  // A single card is one CELL of the sheet — its real cut size (e.g. A4/3 for a 3-up sheet),
  // NOT the full sheet. cellW/cellH come from `lay`; for cardsPerPage=1 the cell IS the full sheet.
  const cellPx = $derived(lay ? { w: lay.cellW, h: lay.cellH } : getPaperPx(template?.size || $project.settings.paperSize, orient));
  // Sheet-mode frame sizes from `lay` (single source of truth, consistent with the grid);
  // card mode from the cell size, so what you see is the actual card you'll cut out.
  const paper = $derived(mode === 'sheet' && lay ? { w: lay.sheetW, h: lay.sheetH } : cellPx);
  const fitScale = $derived(Math.max(0.05, Math.min(1, (paneW - 40) / paper.w)));
  const scale = $derived(userZoom ?? fitScale);

  // Ctrl/⌘ + wheel zooms the canvas (non-passive so we can preventDefault the
  // webview's page-zoom); drag pans the scroll when zoomed in; double-click refits.
  function zoomPan(node: HTMLElement) {
    let sx = 0, sy = 0, sl = 0, st = 0;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      userZoom = zoomStep(scale, e.deltaY);
    };
    const onDblClick = () => { userZoom = null; };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight) return; // nothing to pan
      dragging = true; sx = e.clientX; sy = e.clientY; sl = node.scrollLeft; st = node.scrollTop;
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      node.scrollLeft = sl - (e.clientX - sx);
      node.scrollTop = st - (e.clientY - sy);
    };
    const onUp = () => { dragging = false; };
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('dblclick', onDblClick);
    node.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return { destroy() {
      node.removeEventListener('wheel', onWheel); node.removeEventListener('dblclick', onDblClick);
      node.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
    } };
  }
  const cardHtml = $derived.by(() => {
    if (!record || !schema || !template) return '';
    return buildCardHTML(recordToCard(record, schema, template, $project.settings, $project.activeLocale),
                         $project.settings, $project.activeLocale, false, cellPx);
  });

  // Sheet mode: every record of the schema mapped to a card (packed-or-derived, same as
  // collectPrintSheets), chunked by the resolved per-page count; show the chunk that
  // contains the currently selected record.
  const schemaCards = $derived.by(() => {
    if (!schema || !template) return [] as Card[];
    return $project.records
      .filter((r) => r.schemaId === schema.id)
      .map((r) => $project.cards.find((c) => c.recordId === r.id) ??
        recordToCard(r, schema, template, $project.settings, $project.activeLocale));
  });
  const sheetChunk = $derived.by(() => {
    if (!lay || !record) return [] as Card[];
    const chunks = chunkRecords(schemaCards, lay.perPage);
    return chunks.find((chunk) => chunk.some((c) => c.recordId === record.id)) ?? chunks[0] ?? [];
  });
  const sheetHtml = $derived.by(() => {
    if (!lay) return '';
    return buildSheetHTML(sheetChunk, lay, $project.settings, $project.activeLocale);
  });
  const displayHtml = $derived(mode === 'sheet' ? sheetHtml : cardHtml);

  function onLayout(e: Event) {
    if (schema) setTemplateLayout(schema.id, { layout: (e.target as HTMLSelectElement).value });
  }
</script>

<div class="preview" bind:clientWidth={paneW}>
  <header class="preview-toolbar">
    <label>Layout
      <select value={template?.layout ?? 'fulltext'} onchange={onLayout} disabled={!schema}>
        {#each LAYOUTS as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
      </select>
    </label>
    <label>Paper
      <select value={$project.settings.paperSize} onchange={(e) => setSettings({ paperSize: (e.target as HTMLSelectElement).value as any })}>
        {#each ['A4','A5','A6','Letter'] as p (p)}<option value={p}>{p}</option>{/each}
      </select>
    </label>
    <button type="button" class:on={$project.settings.orientation === 'landscape'}
      onclick={() => setSettings({ orientation: $project.settings.orientation === 'portrait' ? 'landscape' : 'portrait' })}>
      {$project.settings.orientation === 'landscape' ? 'Landscape' : 'Portrait'}
    </button>
    <div class="seg mode-toggle" role="tablist" aria-label="Preview mode">
      <button type="button" role="tab" aria-selected={mode === 'card'} class:on={mode === 'card'} onclick={() => (mode = 'card')}>Card</button>
      <button type="button" role="tab" aria-selected={mode === 'sheet'} class:on={mode === 'sheet'} onclick={() => (mode = 'sheet')}>Sheet</button>
    </div>
    <button type="button" class="style-toggle" class:on={showStyle} aria-label="style" onclick={() => (showStyle = !showStyle)}>
      <Palette size={15} />
    </button>
  </header>

  {#if showStyle}<StyleControls />{/if}

  {#if record && schema}
    <div class="preview-scroll" class:panable={userZoom !== null} class:grabbing={dragging} use:zoomPan
      title="Ctrl/⌘ + scroll to zoom · drag to pan · double-click to fit">
      <div class="preview-frame" style={`width:${Math.round(paper.w * scale)}px;height:${Math.round(paper.h * scale)}px;`}>
        <div class="preview-scaler" style={`transform:scale(${scale});width:${paper.w}px;height:${paper.h}px;`}>
          {@html displayHtml}
        </div>
      </div>
    </div>
  {:else}
    <EmptyState icon={ImageIcon} title="No card to preview"
      hint="Select a record on the left to see its card here." />
  {/if}
</div>

<style>
  .preview { height:100%; min-width:0; display:flex; flex-direction:column; background:var(--bg); }
  .preview-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 12px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  .preview-toolbar label { display:inline-flex; align-items:center; gap:5px; font-size:12px; color:var(--text-muted); }
  .preview-toolbar select, .preview-toolbar button { border:1px solid var(--border); border-radius:6px;
    padding:3px 8px; background:var(--bg); color:var(--text); font:inherit; font-size:12px;
    transition:background .12s ease, color .12s ease, border-color .12s ease; }
  .preview-toolbar button:hover:not(.on) { background:var(--accent-weak); color:var(--accent); }
  .preview-toolbar select:not(:disabled):hover { border-color:var(--accent); }
  .preview-toolbar button.on { background:var(--accent); color:#fff; border-color:var(--accent); }
  .preview-toolbar select:focus-visible, .preview-toolbar button:focus-visible {
    outline:2px solid var(--accent); outline-offset:1px; }
  .style-toggle { margin-left:auto; display:inline-flex; align-items:center; }

  .seg { display:inline-flex; border:1px solid var(--border); border-radius:7px; overflow:hidden; }
  .seg button { border:none; background:transparent; color:var(--text-muted); padding:4px 10px; cursor:pointer;
    font:inherit; font-size:12px; transition:background .12s ease, color .12s ease; }
  .seg button:not(:last-child) { border-right:1px solid var(--border); }
  .seg button:hover:not(.on) { background:var(--accent-weak); color:var(--accent); }
  .seg button.on { background:var(--accent); color:#fff; }
  .seg button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }

  /* Canvas: a recessed stage so the white card reads as a sheet floating on it. */
  .preview-scroll {
    flex:1; min-height:0; overflow:auto;
    padding:20px;
    display:flex; justify-content:safe center; align-items:flex-start;
    background:var(--sidebar);
    box-shadow:inset 0 1px 0 var(--border);
  }
  /* When zoomed (userZoom set), the canvas is draggable to pan. */
  .preview-scroll.panable { cursor:grab; }
  .preview-scroll.grabbing { cursor:grabbing; }
  /* Layout box = scaled size, so flex can center it; the scaler renders the full-size card into it. */
  .preview-frame {
    flex:none;
    border-radius:2px;
    box-shadow:0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.14);
  }
  .preview-scaler { transform-origin:top left; }
</style>
