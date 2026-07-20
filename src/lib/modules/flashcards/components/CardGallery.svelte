<script lang="ts">
  import '../lib/card-render.css';
  import Layers from 'lucide-svelte/icons/layers';
  import FilePlus from 'lucide-svelte/icons/file-plus';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Package from 'lucide-svelte/icons/package';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Upload from 'lucide-svelte/icons/upload';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { project, schemaEditorOpen, cardEditorOpen, packAllForSchema, regenerateCard, deleteCard, applyCardToRecords, galleryStatusbar } from '../stores';
  import { deriveAutoTemplate, recordToCard, viewLabel } from '../cardMapping';
  import { isCardStale } from '../cardOps';
  import { buildCardHTML, buildSheetHTML, sheetLayout } from '../lib/card-render';
  import { collectPrintSheets } from '../lib/printCards';
  import { zoomStep } from '../lib/zoom';
  import { resolveStyle } from '../lib/style';
  import type { RecordItem, Schema, CardTemplate, Card } from '../model';
  import EmptyState from './EmptyState.svelte';

  let { onOpen, hostStatusbar = false }: { onOpen: (recordId: string) => void; hostStatusbar?: boolean } = $props();

  // Delegate the status-bar controls up to the Workspace footer while hosted + a schema exists.
  $effect(() => {
    if (hostStatusbar && $project.schemas.length > 0) {
      galleryStatusbar.set(galleryControls);
      return () => galleryStatusbar.set(null);
    }
    galleryStatusbar.set(null);
  });

  const THUMB_W = 190;
  const SHEET_THUMB_W = 260;

  // Cards view has two modes: the per-card manager (gallery) and the assembled
  // print sheets (same N-up tiling as Print/PDF).
  let gview = $state<'gallery' | 'sheets'>('gallery');
  // Thumbnail zoom (status bar); multiplies the base fit-to-column scale. null → 100% (base).
  let zoom = $state(1);

  // Assembled print sheets, each tagged with its schema name + per-schema page number for captions.
  const sheetItems = $derived.by(() => {
    const pageBySchema = new Map<string, number>();
    return collectPrintSheets($project).map((sheet) => {
      const rid = sheet.cards.find((c) => c.recordId)?.recordId ?? null;
      const rec = rid ? $project.records.find((r) => r.id === rid) : null;
      const schema = rec ? $project.schemas.find((s) => s.id === rec.schemaId) : null;
      const sid = schema?.id ?? '?';
      const page = (pageBySchema.get(sid) ?? 0) + 1;
      pageBySchema.set(sid, page);
      return { sheet, name: schema?.name ?? 'Cards', page, scale: Math.min(1, SHEET_THUMB_W / sheet.lay.sheetW) * zoom };
    });
  });

  // One thumbnail per record: the persisted (packed) card if one exists, else auto-derived.
  // Each card is rendered at its real CUT size (one cell of the N-up sheet), not the full page —
  // same cellW/cellH the preview uses, so a 3-up card shows a third of the page, not a whole A4.
  // Per schema, per VIEW (a schema with no views yet behaves as one auto-derived view — back-compat).
  const groups = $derived($project.schemas.map((schema) => {
    const views = schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)];
    const recs = $project.records.filter((r) => r.schemaId === schema.id);
    const viewGroups = views.map((template, i) => {
      const packed = $project.cards.filter((c) => c.templateId === template.id && c.recordId && recs.some((r) => r.id === c.recordId));
      const packedIds = new Set(packed.map((c) => c.recordId));
      const autoRecs = recs.filter((r) => !packedIds.has(r.id));
      const schemaEff = resolveStyle($project.settings, template.style);
      const lay = sheetLayout(template, schemaEff.paperSize, schemaEff.orientation);
      const cell = { w: lay.cellW, h: lay.cellH };
      const scale = Math.min(1, THUMB_W / cell.w) * zoom;
      return { template, viewName: viewLabel(template, schema, i, $project.activeLocale), packed, autoRecs, cell, scale };
    });
    const totalCards = viewGroups.reduce((n, v) => n + v.packed.length + v.autoRecs.length, 0);
    return { schema, recs, views: viewGroups, totalCards };
  }));

  const totalRecords = $derived($project.records.length);

  function recLabel(rec: RecordItem, schema: Schema): string {
    const f = schema.fields.find((x) => x.type !== 'image');
    if (!f) return '(untitled)';
    const v = rec.fields[f.key];
    const s = v && typeof v === 'object' ? (v[$project.activeLocale] ?? '') : (typeof v === 'string' ? v : '');
    return s.trim() || '(untitled)';
  }
  function caption(rec: RecordItem, schema: Schema): string {
    return recLabel(rec, schema);
  }
  function packedCaption(card: Card): string {
    return (card.title as string)?.trim?.() || 'Card';
  }
  function autoHtml(rec: RecordItem, schema: Schema, template: CardTemplate, cell: { w: number; h: number }): string {
    const eff = resolveStyle($project.settings, template?.style);
    return buildCardHTML(recordToCard(rec, schema, template, $project.settings, $project.activeLocale),
                         eff, $project.activeLocale, false, cell);
  }
  function packedHtml(card: Card, template: CardTemplate, cell: { w: number; h: number }): string {
    const eff = resolveStyle($project.settings, template?.style, card.style);
    return buildCardHTML(card, eff, $project.activeLocale, false, cell); // stored snapshot, resolved style, at cell size
  }
  async function onApply(cardId: string) {
    if (await confirm("Apply this card's content back to its records? This overwrites the record fields.",
                      { title: 'Apply to records', kind: 'warning' })) {
      applyCardToRecords(cardId);
    }
  }
</script>

{#if $project.schemas.length === 0}
  {#snippet createAction()}
    <button type="button" class="cta" onclick={() => schemaEditorOpen.set('__new__')}>Create a schema</button>
  {/snippet}
  <EmptyState icon={Layers} title="No cards yet"
    hint="Create a schema and add records — each one shows up here as a card."
    action={createAction} />
{:else if totalRecords === 0}
  <EmptyState icon={FilePlus} title="No records to show"
    hint="Add records in the Records view — they'll appear here as cards." />
{:else}
  <div class="cards-view">
  <div class="gallery">

    {#if gview === 'sheets'}
      <div class="sheets">
        {#each sheetItems as it, i (i)}
          <div class="sheet-thumb">
            <div class="thumb-frame" style={`width:${Math.round(it.sheet.lay.sheetW * it.scale)}px;height:${Math.round(it.sheet.lay.sheetH * it.scale)}px;`}>
              <div class="thumb-scaler" style={`transform:scale(${it.scale});width:${it.sheet.lay.sheetW}px;height:${it.sheet.lay.sheetH}px;`}>
                {@html buildSheetHTML(it.sheet.cards, it.sheet.lay, it.sheet.settings, $project.activeLocale)}
              </div>
            </div>
            <span class="thumb-cap">{it.name} · page {it.page}</span>
          </div>
        {/each}
      </div>
    {:else}
    {#each groups as g (g.schema.id)}
      <section class="group">
        <header class="group-head">
          <span class="group-name">{g.schema.name}</span>
          <span class="count">{g.totalCards} card{g.totalCards === 1 ? '' : 's'}</span>
          {#if g.recs.length > 0}
            <button type="button" class="pack-all" onclick={() => packAllForSchema(g.schema.id)}>
              <Package size={13} /> Pack all
            </button>
          {/if}
        </header>

        {#if g.recs.length === 0}
          <p class="hint">No records in this schema yet.</p>
        {:else}
          {#each g.views as v (v.template.id)}
            <div class="view-group">
              {#if g.views.length > 1}<h4 class="view-name">{v.viewName}</h4>{/if}
              <div class="grid">
                <!-- Persisted packed cards (snapshots) -->
                {#each v.packed as card (card.id)}
                  {@const stale = isCardStale(card, $project)}
                  {@const edited = !!card.edited}
                  <div class="thumb packed">
                    <button type="button" class="thumb-open" title={packedCaption(card)}
                      onclick={() => card.recordId && onOpen(card.recordId)}>
                      <div class="thumb-frame" style={`width:${Math.round(v.cell.w * v.scale)}px;height:${Math.round(v.cell.h * v.scale)}px;`}>
                        <div class="thumb-scaler" style={`transform:scale(${v.scale});width:${v.cell.w}px;height:${v.cell.h}px;`}>
                          {@html packedHtml(card, v.template, v.cell)}
                        </div>
                      </div>
                    </button>
                    <div class="thumb-meta">
                      <span class="badge {edited ? 'edited' : stale ? 'stale' : 'synced'}">{edited ? 'Edited' : stale ? 'Stale' : 'Synced'}</span>
                      <button type="button" class="icon-act" aria-label="edit card" title="Edit card"
                        onclick={() => cardEditorOpen.set(card.id)}><Pencil size={13} /></button>
                      {#if edited}
                        <button type="button" class="icon-act" aria-label="apply to records" title="Apply to records"
                          onclick={() => onApply(card.id)}><Upload size={13} /></button>
                      {/if}
                      {#if stale || edited}
                        <button type="button" class="icon-act" aria-label="regenerate" title="Regenerate from records"
                          onclick={() => regenerateCard(card.id)}><RefreshCw size={13} /></button>
                      {/if}
                      <button type="button" class="icon-act danger" aria-label="delete" title="Delete card"
                        onclick={() => deleteCard(card.id)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                {/each}
                <!-- Auto-derived cards for records not yet packed (for this view) -->
                {#each v.autoRecs as rec (rec.id)}
                  <button type="button" class="thumb auto" title={caption(rec, g.schema)} onclick={() => onOpen(rec.id)}>
                    <div class="thumb-frame" style={`width:${Math.round(v.cell.w * v.scale)}px;height:${Math.round(v.cell.h * v.scale)}px;`}>
                      <div class="thumb-scaler" style={`transform:scale(${v.scale});width:${v.cell.w}px;height:${v.cell.h}px;`}>
                        {@html autoHtml(rec, g.schema, v.template, v.cell)}
                      </div>
                    </div>
                    <span class="thumb-cap">{caption(rec, g.schema)}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </section>
    {/each}
    {/if}
  </div>
    {#if !hostStatusbar}
      <footer class="gallery-statusbar sb-cluster">{@render galleryControls()}</footer>
    {/if}
  </div>
{/if}

{#snippet galleryControls()}
  <div class="seg" role="tablist" aria-label="Cards view mode">
    <button type="button" role="tab" aria-selected={gview === 'gallery'} class:on={gview === 'gallery'}
      onclick={() => (gview = 'gallery')}>Gallery</button>
    <button type="button" role="tab" aria-selected={gview === 'sheets'} class:on={gview === 'sheets'}
      onclick={() => (gview = 'sheets')}>Sheets</button>
  </div>
  <span class="sb-info">
    {#if gview === 'sheets'}{sheetItems.length} sheet{sheetItems.length === 1 ? '' : 's'} · same layout as Print / PDF
    {:else}{totalRecords} card{totalRecords === 1 ? '' : 's'}{/if}
  </span>
  <div class="zoom-controls" role="group" aria-label="Zoom">
    <button type="button" aria-label="Zoom out" onclick={() => (zoom = zoomStep(zoom, 1))}>−</button>
    <button type="button" class="zoom-pct" class:auto={zoom === 1} title="Reset to 100%"
      aria-label="Reset zoom" onclick={() => (zoom = 1)}>{Math.round(zoom * 100)}%</button>
    <button type="button" aria-label="Zoom in" onclick={() => (zoom = zoomStep(zoom, -1))}>+</button>
  </div>
{/snippet}

<style>
  .cards-view { height:100%; min-height:0; display:flex; flex-direction:column; background:var(--sidebar); }
  .gallery { flex:1; min-height:0; overflow:auto; padding:16px;
    display:flex; flex-direction:column; gap:20px; }
  .seg { display:inline-flex; border:1px solid var(--border); border-radius:7px; overflow:hidden; background:var(--bg); }
  .seg button { border:none; background:transparent; color:var(--text-muted); padding:4px 12px; cursor:pointer;
    font:inherit; font-size:12px; transition:background .12s ease, color .12s ease; }
  .seg button:not(:last-child) { border-right:1px solid var(--border); }
  .seg button:hover:not(.on) { background:var(--accent-weak); color:var(--accent); }
  .seg button.on { background:var(--accent); color:#fff; }
  .seg button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }

  /* Status bar pinned below the scrolling gallery: view mode + count + thumbnail zoom. */
  .gallery-statusbar { display:flex; align-items:center; gap:10px; flex:none; padding:4px 12px;
    background:var(--surface); border-top:1px solid var(--border); font-size:11px; color:var(--text-muted); }
  .gallery-statusbar .seg button { padding:2px 10px; font-size:11px; }
  .sb-info { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .zoom-controls { display:inline-flex; align-items:center; gap:2px; flex:none; }
  .zoom-controls button { border:1px solid var(--border); background:var(--bg); color:var(--text); font:inherit;
    border-radius:6px; padding:2px 7px; cursor:pointer; transition:background .12s ease, color .12s ease, border-color .12s ease; }
  .zoom-controls button:hover { background:var(--accent-weak); color:var(--accent); border-color:var(--accent); }
  .zoom-controls button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .zoom-pct { min-width:46px; text-align:center; font-variant-numeric:tabular-nums; }
  .zoom-pct.auto { color:var(--text-muted); }

  /* Assembled print sheets — bigger thumbnails than single cards (a whole page). */
  .sheets { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:18px; align-items:start; }
  .sheet-thumb { display:flex; flex-direction:column; align-items:center; gap:6px; }
  .group { display:flex; flex-direction:column; gap:10px; }
  .group-head { display:flex; align-items:center; gap:8px; }
  .group-name { font-weight:600; font-size:13px; color:var(--text); }
  .count { font-size:11px; color:var(--text-muted); background:var(--accent-weak); border-radius:10px; padding:0 7px; }
  .pack-all { margin-left:auto; display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:4px 10px; font:inherit; font-size:12px;
    cursor:pointer; transition:background .12s ease, color .12s ease; }
  .pack-all:hover { background:var(--accent-weak); color:var(--accent); }
  .pack-all:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .hint { color:var(--text-muted); font-size:12px; margin:0; }
  .view-group { display:flex; flex-direction:column; gap:8px; }
  .view-name { margin:0; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
    color:var(--text-muted); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:14px; align-items:start; }

  .thumb { display:flex; flex-direction:column; align-items:center; gap:6px; border:none; background:transparent;
    padding:6px; border-radius:10px; font:inherit; }
  .thumb.auto { cursor:pointer; transition:background .12s ease; }
  .thumb.auto:hover { background:var(--accent-weak); }
  .thumb.auto:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .thumb-open { border:none; background:transparent; padding:0; cursor:pointer; }
  .thumb-frame { flex:none; border-radius:2px; box-shadow:0 1px 2px rgba(0,0,0,.08), 0 6px 18px rgba(0,0,0,.12);
    overflow:hidden; transition:box-shadow .12s ease, transform .12s ease; }
  .thumb.auto:hover .thumb-frame, .thumb.auto:focus-visible .thumb-frame,
  .thumb-open:hover .thumb-frame, .thumb-open:focus-visible .thumb-frame {
    transform:translateY(-2px); box-shadow:0 0 0 2px var(--accent), 0 10px 24px rgba(0,0,0,.20); }
  .thumb-scaler { transform-origin:top left; }
  .thumb-cap { font-size:12px; color:var(--text); max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .thumb-meta { display:flex; align-items:center; gap:6px; }
  .badge { font-size:11px; font-weight:600; border-radius:10px; padding:1px 8px; }
  .badge.synced { color:var(--accent); background:var(--accent-weak); }
  .badge.stale { color:#b45309; background:#fef3c7; }
  .badge.edited { color:#1d4ed8; background:#dbeafe; }
  .icon-act { display:inline-flex; align-items:center; border:1px solid var(--border); background:transparent;
    color:var(--text-muted); border-radius:6px; padding:3px; cursor:pointer; transition:background .12s ease, color .12s ease; }
  .icon-act:hover { background:var(--accent-weak); color:var(--accent); }
  .icon-act.danger:hover { background:var(--danger-weak); color:var(--danger); }
  .icon-act:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }

  .cta { border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:600;
    border-radius:6px; padding:6px 14px; font:inherit; font-size:12px; cursor:pointer; }
  .cta:hover { opacity:.92; }
  .cta:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
