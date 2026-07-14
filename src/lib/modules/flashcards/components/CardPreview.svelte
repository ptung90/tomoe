<script lang="ts">
  import '../lib/card-render.css';
  import Palette from 'lucide-svelte/icons/palette';
  import ImageIcon from 'lucide-svelte/icons/image';
  import { project, selectedRecordId, setSettings, setTemplateLayout } from '../stores';
  import { deriveAutoTemplate, recordsToCard, cardsPerPage, chunkRecords } from '../cardMapping';
  import { buildCardHTML, LAYOUTS, getPaperPx } from '../lib/card-render';
  import StyleControls from './StyleControls.svelte';
  import EmptyState from './EmptyState.svelte';

  // Human-readable names for the layout dropdown (values stay the engine ids).
  const LAYOUT_LABELS: Record<string, string> = {
    fulltext: 'Text only',
    fullimage: 'Image only',
    '2x2': '2×2 grid',
    '1top-1bot': 'Image top / text bottom',
    '1top-2bot': '1 top / 2 bottom',
    '2top-1bot': '2 top / 1 bottom',
    '3card': '3 mini-cards',
  };

  let paneW = $state(360);
  let showStyle = $state(false);

  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((s) => s.id === record.schemaId) ?? null) : null);
  const template = $derived(schema ? (schema.cardTemplates[0] ?? deriveAutoTemplate(schema)) : null);

  const paper = $derived(getPaperPx(
    template?.size || $project.settings.paperSize,
    template?.orientation || $project.settings.orientation,
  ));
  const scale = $derived(Math.max(0.05, Math.min(1, (paneW - 40) / paper.w)));
  const cardHtml = $derived.by(() => {
    if (!record || !schema || !template) return '';
    const schemaRecords = $project.records.filter((r) => r.schemaId === schema.id);
    const chunks = chunkRecords(schemaRecords, cardsPerPage(template.layout));
    const chunk = chunks.find((c) => c.some((r) => r.id === record.id)) ?? [record];
    return buildCardHTML(recordsToCard(chunk, schema, template, $project.settings, $project.activeLocale),
                         $project.settings, $project.activeLocale);
  });

  function onLayout(e: Event) {
    if (schema) setTemplateLayout(schema.id, { layout: (e.target as HTMLSelectElement).value });
  }
</script>

<div class="preview" bind:clientWidth={paneW}>
  <header class="preview-toolbar">
    <label>Layout
      <select value={template?.layout ?? 'fulltext'} onchange={onLayout} disabled={!schema}>
        {#each LAYOUTS as l (l)}<option value={l}>{LAYOUT_LABELS[l] ?? l}</option>{/each}
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
    <div class="preview-scroll">
      <div class="preview-frame" style={`width:${Math.round(paper.w * scale)}px;height:${Math.round(paper.h * scale)}px;`}>
        <div class="preview-scaler" style={`transform:scale(${scale});width:${paper.w}px;height:${paper.h}px;`}>
          {@html cardHtml}
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

  /* Canvas: a recessed stage so the white card reads as a sheet floating on it. */
  .preview-scroll {
    flex:1; min-height:0; overflow:auto;
    padding:20px;
    display:flex; justify-content:center; align-items:flex-start;
    background:var(--sidebar);
    box-shadow:inset 0 1px 0 var(--border);
  }
  /* Layout box = scaled size, so flex can center it; the scaler renders the full-size card into it. */
  .preview-frame {
    flex:none;
    border-radius:2px;
    box-shadow:0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.14);
  }
  .preview-scaler { transform-origin:top left; }

  /* Slim, unobtrusive scrollbars on the canvas. */
  .preview-scroll::-webkit-scrollbar { width:10px; height:10px; }
  .preview-scroll::-webkit-scrollbar-thumb {
    background:var(--border); border-radius:6px;
    border:2px solid var(--sidebar); background-clip:padding-box;
  }
  .preview-scroll::-webkit-scrollbar-thumb:hover { background:var(--text-muted); background-clip:padding-box; }
  .preview-scroll::-webkit-scrollbar-track { background:transparent; }
</style>
