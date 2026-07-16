<script lang="ts">
  import '../lib/card-render.css';
  import Palette from 'lucide-svelte/icons/palette';
  import ImageIcon from 'lucide-svelte/icons/image';
  import Plus from 'lucide-svelte/icons/plus';
  import MoreHorizontal from 'lucide-svelte/icons/more-horizontal';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { project, selectedRecordId, activeViewId, selectView, setSettings, setTemplateLayout, addView, renameView, deleteView } from '../stores';
  import { deriveAutoTemplate, recordToCard, chunkRecords, viewLabel } from '../cardMapping';
  import { buildCardHTML, buildSheetHTML, getPaperPx, sheetLayout } from '../lib/card-render';
  import { resolveStyle } from '../lib/style';
  import { LAYOUTS } from '../lib/layouts';
  import { zoomStep } from '../lib/zoom';
  import StyleControls from './StyleControls.svelte';
  import EmptyState from './EmptyState.svelte';
  import type { Card } from '../model';

  let paneW = $state(440);
  let showStyle = $state(false);
  let mode = $state<'card' | 'sheet'>('card');
  // null = auto-fit; a number = explicit user zoom (Ctrl/⌘ + wheel, +/- buttons). Opens at 100%;
  // double-click / the status-bar "Fit to pane" % button reset to auto-fit (null).
  let userZoom = $state<number | null>(1);
  let dragging = $state(false);
  // Per-view-column rename/menu UI state — at most one open/renaming at a time.
  let menuOpenId = $state<string | null>(null);
  let renamingId = $state<string | null>(null);
  // Escape sets this before blurring the input, so the blur handler (which normally
  // commits) knows to discard instead — blur fires even when the input is removed from
  // the DOM by a real browser's focus-fixup, so cancel must be explicit, not "don't null it".
  let renameCancel = false;

  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((s) => s.id === record.schemaId) ?? null) : null);
  // Every view of the schema (>=1 — auto-derived if the schema has no cardTemplates yet).
  const views = $derived(schema ? (schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)]) : []);
  // The view every control below targets. Falls back to the schema's first view whenever the stored
  // id doesn't name one of THIS schema's views (fresh project, or the record just switched schema).
  const resolvedActiveId = $derived(views.find((v) => v.id === $activeViewId)?.id ?? views[0]?.id ?? null);
  const template = $derived(views.find((v) => v.id === resolvedActiveId) ?? null);

  const selectedCard = $derived(record && template ? ($project.cards.find((c) => c.recordId === record.id && c.templateId === template.id) ?? null) : null);
  const schemaEff = $derived(template ? resolveStyle($project.settings, template.style) : $project.settings);
  const eff = $derived(template ? resolveStyle(schemaEff, selectedCard?.style) : $project.settings);
  const orient = $derived(eff.orientation);
  const lay = $derived(template ? sheetLayout(template, eff.paperSize, orient) : null);

  // A single card is one CELL of the sheet — its real cut size (e.g. A4/3 for a 3-up sheet),
  // NOT the full sheet. cellW/cellH come from `lay`; for cardsPerPage=1 the cell IS the full sheet.
  const cellPx = $derived(lay ? { w: lay.cellW, h: lay.cellH } : getPaperPx(template?.size || eff.paperSize, orient));
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
      userZoom = zoomStep(displayScale, e.deltaY);
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
  // One rendered card per view, side by side — each at ITS OWN resolved style/cell size (so an
  // Image-only view and a Content-only view keep their real proportions, not the active view's).
  const viewCards = $derived.by(() => {
    if (!record || !schema) return [] as { id: string; label: string; html: string; cellPx: { w: number; h: number } }[];
    return views.map((v, i) => {
      const vCard = $project.cards.find((c) => c.recordId === record.id && c.templateId === v.id) ?? null;
      const vSchemaEff = resolveStyle($project.settings, v.style);
      const vEff = resolveStyle(vSchemaEff, vCard?.style);
      const vLay = sheetLayout(v, vEff.paperSize, vEff.orientation);
      const vCellPx = { w: vLay.cellW, h: vLay.cellH };
      const html = buildCardHTML(recordToCard(record, schema, v, $project.settings, $project.activeLocale), vEff, $project.activeLocale, false, vCellPx);
      return { id: v.id, label: viewLabel(v, schema, i, $project.activeLocale), html, cellPx: vCellPx };
    });
  });
  // Each column fits within an equal share of the pane's width; explicit userZoom overrides all columns.
  const colBudget = $derived(Math.max(80, (paneW - 40 - Math.max(0, views.length - 1) * 16) / Math.max(1, views.length)));
  function colScale(cellW: number): number { return Math.max(0.05, Math.min(1, colBudget / cellW)); }
  // The scale the ACTIVE view is actually shown at — what the status-bar % must report (and the base
  // for the −/+ buttons). Card mode auto-fits each column to its share of the pane (colScale) when
  // zoomed out to auto-fit; sheet mode uses the full-pane fitScale; an explicit userZoom overrides both.
  const displayScale = $derived(mode === 'sheet' ? scale : (userZoom ?? colScale(cellPx.w)));

  // Sheet mode: every record of the schema mapped through the ACTIVE view (packed-or-derived, same
  // as collectPrintSheets does per view), chunked by that view's resolved per-page count.
  const schemaCards = $derived.by(() => {
    if (!schema || !template) return [] as Card[];
    return $project.records
      .filter((r) => r.schemaId === schema.id)
      .map((r) => $project.cards.find((c) => c.recordId === r.id && c.templateId === template.id) ??
        recordToCard(r, schema, template, $project.settings, $project.activeLocale));
  });
  const sheetChunk = $derived.by(() => {
    if (!lay || !record) return [] as Card[];
    const chunks = chunkRecords(schemaCards, lay.perPage);
    return chunks.find((chunk) => chunk.some((c) => c.recordId === record.id)) ?? chunks[0] ?? [];
  });
  const sheetHtml = $derived.by(() => {
    if (!lay) return '';
    return buildSheetHTML(sheetChunk, lay, schemaEff, $project.activeLocale);
  });

  function onLayout(e: Event) {
    if (schema && template) setTemplateLayout(schema.id, { layout: (e.target as HTMLSelectElement).value }, template.id);
  }
  function onAddView() {
    if (schema) addView(schema.id);
  }
  function toggleMenu(id: string) {
    menuOpenId = menuOpenId === id ? null : id;
  }
  function startRename(id: string) {
    menuOpenId = null;
    renameCancel = false;
    renamingId = id;
  }
  function commitRename(templateId: string, name: string) {
    if (renameCancel) {
      renameCancel = false;
      renamingId = null;
      return;
    }
    renamingId = null;
    const trimmed = name.trim();
    if (schema && trimmed) renameView(schema.id, templateId, trimmed);
  }
  function onDeleteView(templateId: string) {
    menuOpenId = null;
    if (schema && views.length > 1) deleteView(schema.id, templateId);
  }

  // Close the open ⋯ menu on an outside click. `.view-col-menu` wraps both the toggle
  // button and the dropdown, so a click on the toggle itself is "inside" and won't
  // immediately reclose the menu it just opened.
  $effect(() => {
    if (menuOpenId === null) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.view-col-menu')) return;
      menuOpenId = null;
    };
    window.addEventListener('click', onDocClick);
    return () => window.removeEventListener('click', onDocClick);
  });
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
    <button type="button" class="style-toggle" class:on={showStyle} aria-label="style" onclick={() => (showStyle = !showStyle)}>
      <Palette size={15} />
    </button>
  </header>

  {#if showStyle}<StyleControls />{/if}

  {#if record && schema}
    {#if mode === 'card'}
      <div class="preview-scroll views-row" class:panable={userZoom !== null} class:grabbing={dragging} use:zoomPan
        title="Ctrl/⌘ + scroll to zoom · drag to pan · double-click to fit">
        {#each viewCards as vc (vc.id)}
          {@const vScale = userZoom ?? colScale(vc.cellPx.w)}
          <div class="view-col" class:active={vc.id === resolvedActiveId}
            role="button" tabindex="0" aria-label={`Focus ${vc.label}`}
            onclick={() => selectView(vc.id)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectView(vc.id); } }}>
            <div class="view-col-header">
              {#if renamingId === vc.id}
                <input class="view-col-rename" value={vc.label}
                  aria-label={`Rename ${vc.label}`}
                  onclick={(e) => e.stopPropagation()}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                    if (e.key === 'Escape') { e.preventDefault(); renameCancel = true; (e.target as HTMLInputElement).blur(); }
                  }}
                  onblur={(e) => commitRename(vc.id, (e.target as HTMLInputElement).value)} />
              {:else}
                <span class="view-col-label">{vc.label}</span>
              {/if}
              <div class="view-col-menu">
                <button type="button" class="view-menu-btn" aria-label={`${vc.label} options`}
                  aria-haspopup="menu" aria-expanded={menuOpenId === vc.id}
                  onclick={(e) => { e.stopPropagation(); toggleMenu(vc.id); }}>
                  <MoreHorizontal size={17} />
                </button>
                {#if menuOpenId === vc.id}
                  <div class="view-menu" role="menu">
                    <button type="button" role="menuitem" onclick={(e) => { e.stopPropagation(); startRename(vc.id); }}>
                      <Pencil size={12} /> Rename
                    </button>
                    <button type="button" role="menuitem" aria-label={`Delete ${vc.label}`}
                      disabled={views.length <= 1}
                      onclick={(e) => { e.stopPropagation(); onDeleteView(vc.id); }}>
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                {/if}
              </div>
            </div>
            <div class="preview-frame" style={`width:${Math.round(vc.cellPx.w * vScale)}px;height:${Math.round(vc.cellPx.h * vScale)}px;`}>
              <div class="preview-scaler" style={`transform:scale(${vScale});width:${vc.cellPx.w}px;height:${vc.cellPx.h}px;`}>
                {@html vc.html}
              </div>
            </div>
          </div>
        {/each}
        <button type="button" class="add-view-tile" aria-label="Add view" onclick={onAddView}>
          <Plus size={18} />
          <span>Add view</span>
        </button>
      </div>
    {:else}
      <div class="preview-scroll" class:panable={userZoom !== null} class:grabbing={dragging} use:zoomPan
        title="Ctrl/⌘ + scroll to zoom · drag to pan · double-click to fit">
        <div class="preview-frame" style={`width:${Math.round(paper.w * scale)}px;height:${Math.round(paper.h * scale)}px;`}>
          <div class="preview-scaler" style={`transform:scale(${scale});width:${paper.w}px;height:${paper.h}px;`}>
            {@html sheetHtml}
          </div>
        </div>
      </div>
    {/if}
    <footer class="preview-statusbar">
      <div class="seg" role="tablist" aria-label="Preview mode">
        <button type="button" role="tab" aria-selected={mode === 'card'} class:on={mode === 'card'} onclick={() => (mode = 'card')}>Card</button>
        <button type="button" role="tab" aria-selected={mode === 'sheet'} class:on={mode === 'sheet'} onclick={() => (mode = 'sheet')}>Sheet</button>
      </div>
      <span class="sb-info" title="{mode === 'sheet' ? 'Sheet' : 'Card'} size at 100%">
        {eff.paperSize} · {orient === 'landscape' ? 'landscape' : 'portrait'} · {paper.w}×{paper.h}px
      </span>
      <div class="zoom-controls" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" onclick={() => (userZoom = zoomStep(displayScale, 1))}>−</button>
        <button type="button" class="zoom-pct" class:auto={userZoom === null}
          title="Fit to pane" aria-label="Fit to pane" onclick={() => (userZoom = null)}>{Math.round(displayScale * 100)}%</button>
        <button type="button" aria-label="Zoom in" onclick={() => (userZoom = zoomStep(displayScale, -1))}>+</button>
      </div>
    </footer>
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
  .preview-scroll.views-row { flex-wrap:wrap; gap:16px; justify-content:flex-start; align-items:flex-start; }
  .view-col { display:flex; flex-direction:column; align-items:stretch; gap:6px; cursor:pointer;
    border-radius:8px; padding:6px; transition:background .12s ease; min-width:0; }
  .view-col:hover:not(.active) { background:var(--accent-weak); }
  .view-col:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }

  /* Per-view card header: name (rename-in-place) + a ⋯ menu (Rename / Delete). */
  .view-col-header { display:flex; align-items:center; gap:6px; min-height:28px; padding:0 2px; }
  .view-col-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-size:12px; font-weight:600; color:var(--text); transition:color .12s ease; }
  .view-col.active .view-col-label { color:var(--accent); }
  .view-col-rename { flex:1; min-width:0; font:inherit; font-size:12px; font-weight:600; color:var(--text);
    background:var(--bg); border:1px solid var(--accent); border-radius:4px; padding:2px 5px; }
  .view-col-menu { position:relative; flex:none; }
  /* Visible ⋯ button — bordered chip, high-contrast, so it reads as an actionable control. */
  .view-menu-btn { border:1px solid var(--border); background:var(--bg); color:var(--text); cursor:pointer;
    display:inline-flex; align-items:center; justify-content:center; width:28px; height:24px; border-radius:6px;
    transition:background .12s ease, color .12s ease, border-color .12s ease; }
  .view-menu-btn:hover, .view-menu-btn[aria-expanded="true"] { background:var(--accent-weak); color:var(--accent); border-color:var(--accent); }
  .view-menu-btn:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .view-menu { position:absolute; top:100%; right:0; z-index:10; margin-top:3px; min-width:132px;
    background:var(--surface); border:1px solid var(--border); border-radius:7px;
    box-shadow:0 6px 18px rgba(0,0,0,.16); padding:5px; display:flex; flex-direction:column; gap:2px; }
  .view-menu button { display:flex; align-items:center; gap:7px; border:none; background:transparent;
    color:var(--text); font:inherit; font-size:13px; padding:7px 9px; border-radius:5px; cursor:pointer;
    text-align:left; transition:background .12s ease, color .12s ease; }
  .view-menu button:hover:not(:disabled) { background:var(--accent-weak); color:var(--accent); }
  .view-menu button:focus-visible { outline:2px solid var(--accent); outline-offset:-1px; }
  .view-menu button:disabled { color:var(--text-muted); opacity:.5; cursor:not-allowed; }

  /* "＋ Add view" — a dashed placeholder tile at the end of the row. */
  .add-view-tile { flex:none; align-self:flex-start; margin-top:28px; width:96px; height:120px;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
    border:1.5px dashed var(--border); border-radius:8px; background:transparent; color:var(--text-muted);
    font:inherit; font-size:11px; cursor:pointer; transition:border-color .12s ease, color .12s ease, background .12s ease; }
  .add-view-tile:hover { border-color:var(--accent); color:var(--accent); background:var(--accent-weak); }
  .add-view-tile:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }

  /* Layout box = scaled size, so flex can center it; the scaler renders the full-size card into it. */
  .preview-frame {
    flex:none;
    border-radius:2px;
    box-shadow:0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.14);
  }
  .view-col.active .preview-frame {
    outline:2px solid var(--accent);
    outline-offset:3px;
    box-shadow:0 1px 2px rgba(0,0,0,.08), 0 10px 28px rgba(0,0,0,.16);
  }
  .preview-scaler { transform-origin:top left; }

  /* Thin status bar under the canvas: preview-mode switch (Card/Sheet is a preview concern,
     not a style setting) + viewport size + zoom readout. */
  .preview-statusbar { display:flex; align-items:center; gap:10px; flex:none; padding:4px 10px;
    background:var(--surface); border-top:1px solid var(--border); font-size:11px; color:var(--text-muted); }
  .preview-statusbar .seg button { padding:2px 9px; font-size:11px; }
  .sb-info { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .zoom-controls { display:inline-flex; align-items:center; gap:2px; flex:none; }
  .zoom-controls button { border:1px solid var(--border); background:var(--bg); color:var(--text); font:inherit;
    border-radius:6px; padding:2px 7px; cursor:pointer; transition:background .12s ease, color .12s ease, border-color .12s ease; }
  .zoom-controls button:hover { background:var(--accent-weak); color:var(--accent); border-color:var(--accent); }
  .zoom-controls button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .zoom-pct { min-width:46px; text-align:center; font-variant-numeric:tabular-nums; }
  .zoom-pct.auto { color:var(--text-muted); }
</style>
