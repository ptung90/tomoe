<script lang="ts">
  import Type from 'lucide-svelte/icons/type';
  import ALargeSmall from 'lucide-svelte/icons/a-large-small';
  import Bold from 'lucide-svelte/icons/bold';
  import StretchVertical from 'lucide-svelte/icons/stretch-vertical';
  import AlignLeft from 'lucide-svelte/icons/align-left';
  import AlignCenter from 'lucide-svelte/icons/align-center';
  import AlignRight from 'lucide-svelte/icons/align-right';
  import Square from 'lucide-svelte/icons/square';
  import SquareDashed from 'lucide-svelte/icons/square-dashed';
  import Spline from 'lucide-svelte/icons/spline';
  import ScanLine from 'lucide-svelte/icons/scan-line';
  import ImageIcon from 'lucide-svelte/icons/image';
  import MoveVertical from 'lucide-svelte/icons/move-vertical';
  import LayoutGrid from 'lucide-svelte/icons/layout-grid';
  import { project, selectedRecordId, setSettings, setTemplateLayout } from '../stores';
  import { deriveAutoTemplate } from '../cardMapping';
  import { sheetLayout } from '../lib/card-render';
  import type { FontSpec } from '../model';

  const s = $derived($project.settings);
  const num = (e: Event) => Number((e.target as HTMLInputElement).value);
  const str = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;

  const FONT_FAMILIES = ['Lexend', 'sans-serif', 'serif', 'monospace', 'Georgia', 'Arial', 'Times New Roman', 'Courier New'];
  const WEIGHTS: { v: number; label: string }[] = [
    { v: 400, label: 'Normal' }, { v: 500, label: 'Medium' }, { v: 600, label: 'Semibold' }, { v: 700, label: 'Bold' },
  ];
  const ALIGNS = ['left', 'center', 'right'] as const;
  const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight };

  // Image-area height is a per-schema template property; resolve it from the selected record.
  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((x) => x.id === record.schemaId) ?? null) : null);
  const template = $derived(schema ? (schema.cardTemplates[0] ?? deriveAutoTemplate(schema)) : null);
  const imgHeightApplies = $derived(!!template && template.layout !== 'fulltext' && template.layout !== 'fullimage');
  function onImageHeight(e: Event) {
    if (!schema) return;
    const v = Math.round(Number((e.target as HTMLInputElement).value)) || 50;
    setTemplateLayout(schema.id, { imageHeightPercent: Math.min(95, Math.max(5, v)) });
  }

  // Cards/page (N-up tiling): Fixed grid (cardsPerPage) or Auto-fit (real-size cardSize).
  const orient = $derived(template?.orientation || s.orientation);
  const resolvedPerPage = $derived(template ? sheetLayout(template, s.paperSize, orient).perPage : 0);
  const CARDS_PER_PAGE = [1, 2, 3, 4, 6, 8, 9];
  const CARD_SIZES = ['A5', 'A6', 'A7', 'A8'];
  function onAutoFitMode(autoFit: boolean) {
    if (schema) setTemplateLayout(schema.id, { autoFit });
  }
  function onCardsPerPage(e: Event) {
    if (schema) setTemplateLayout(schema.id, { cardsPerPage: Number((e.target as HTMLSelectElement).value), autoFit: false });
  }
  function onCardSize(e: Event) {
    if (schema) setTemplateLayout(schema.id, { cardSize: (e.target as HTMLSelectElement).value as any, autoFit: true });
  }

  let tab = $state<'text' | 'card' | 'image'>('text');
  let textSub = $state<'title' | 'content'>('title');
  let cardSub = $state<'border' | 'spacing' | 'page'>('border');
</script>

<div class="style-controls">
  <div class="tabs" role="tablist" aria-label="Style sections">
    <button type="button" role="tab" aria-selected={tab === 'text'} class:on={tab === 'text'} onclick={() => (tab = 'text')}>Text</button>
    <button type="button" role="tab" aria-selected={tab === 'card'} class:on={tab === 'card'} onclick={() => (tab = 'card')}>Card</button>
    <button type="button" role="tab" aria-selected={tab === 'image'} class:on={tab === 'image'} onclick={() => (tab = 'image')}>Image</button>
  </div>

  {#if tab === 'text'}
    <div class="subtabs" role="tablist" aria-label="Text target">
      <button type="button" role="tab" aria-selected={textSub === 'title'} class:on={textSub === 'title'} onclick={() => (textSub = 'title')}>Title</button>
      <button type="button" role="tab" aria-selected={textSub === 'content'} class:on={textSub === 'content'} onclick={() => (textSub = 'content')}>Content</button>
    </div>
    <div class="panel" role="tabpanel">
      {#if textSub === 'title'}
        {@render fontTools(s.titleFont, (p) => setSettings({ titleFont: { ...s.titleFont, ...p } }))}
      {:else}
        {@render fontTools(s.contentFont, (p) => setSettings({ contentFont: { ...s.contentFont, ...p } }))}
      {/if}
    </div>
  {:else if tab === 'card'}
    <div class="subtabs" role="tablist" aria-label="Card target">
      <button type="button" role="tab" aria-selected={cardSub === 'border'} class:on={cardSub === 'border'} onclick={() => (cardSub = 'border')}>Border</button>
      <button type="button" role="tab" aria-selected={cardSub === 'spacing'} class:on={cardSub === 'spacing'} onclick={() => (cardSub = 'spacing')}>Spacing</button>
      <button type="button" role="tab" aria-selected={cardSub === 'page'} class:on={cardSub === 'page'} onclick={() => (cardSub = 'page')}>Page</button>
    </div>
    <div class="panel" role="tabpanel">
      {#if cardSub === 'border'}
        <div class="toolbar">
          <span class="tool" title="Border width"><Square size={14} /><input aria-label="Width" type="number" min="0" value={s.border.width}
            onchange={(e) => setSettings({ border: { ...s.border, width: num(e) } })} /></span>
          <span class="tool" title="Border style"><SquareDashed size={14} />
            <select aria-label="Style" value={s.border.style} onchange={(e) => setSettings({ border: { ...s.border, style: str(e) } })}>
              {#each ['solid','dashed','dotted','double','none'] as st (st)}<option value={st}>{st}</option>{/each}
            </select>
          </span>
          <span class="tool" title="Border color"><input aria-label="Border color" type="color" value={s.border.color}
            oninput={(e) => setSettings({ border: { ...s.border, color: str(e) } })} /></span>
          <span class="tool" title="Corner radius"><Spline size={14} /><input aria-label="Radius" type="number" min="0" value={s.border.radius}
            onchange={(e) => setSettings({ border: { ...s.border, radius: num(e) } })} /></span>
        </div>
      {:else if cardSub === 'spacing'}
        <div class="toolbar">
          <span class="tool" title="Card margin (mm)"><ScanLine size={14} /><input aria-label="Card margin (mm)" type="number" min="0" value={s.margin}
            onchange={(e) => setSettings({ margin: num(e) })} /></span>
          <span class="tool" title="Padding (mm)"><SquareDashed size={14} /><input aria-label="Padding (mm)" type="number" min="0" value={s.padding}
            onchange={(e) => setSettings({ padding: num(e) })} /></span>
          <span class="tool" title="Image padding (mm)"><ImageIcon size={14} /><input aria-label="Image padding (mm)" type="number" min="0" value={s.imgPadding}
            onchange={(e) => setSettings({ imgPadding: num(e) })} /></span>
          <span class="tool" title="Vertical text align"><MoveVertical size={14} />
            <select aria-label="Vertical text align" value={s.textVAlign} onchange={(e) => setSettings({ textVAlign: str(e) as 'top'|'middle'|'bottom' })}>
              {#each ['top','middle','bottom'] as v (v)}<option value={v}>{v}</option>{/each}
            </select>
          </span>
        </div>
      {:else}
        <div class="toolbar">
          <div class="seg" title="Tiling mode" role="tablist" aria-label="Tiling mode">
            <button type="button" role="tab" aria-selected={!template?.autoFit} class:on={!template?.autoFit}
              disabled={!schema} onclick={() => onAutoFitMode(false)}>Fixed</button>
            <button type="button" role="tab" aria-selected={!!template?.autoFit} class:on={!!template?.autoFit}
              disabled={!schema} onclick={() => onAutoFitMode(true)}>Auto-fit</button>
          </div>
          {#if !template?.autoFit}
            <span class="tool" title="Cards per page"><LayoutGrid size={14} />
              <select aria-label="Cards per page" value={template?.cardsPerPage ?? 1} disabled={!schema} onchange={onCardsPerPage}>
                {#each CARDS_PER_PAGE as n (n)}<option value={n}>{n}</option>{/each}
              </select>
            </span>
          {:else}
            <span class="tool" title="Card size"><LayoutGrid size={14} />
              <select aria-label="Card size" value={template?.cardSize ?? 'A7'} disabled={!schema} onchange={onCardSize}>
                {#each CARD_SIZES as sz (sz)}<option value={sz}>{sz}</option>{/each}
              </select>
            </span>
            <span class="hint">≈ {resolvedPerPage}/trang</span>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="panel" role="tabpanel">
      <div class="toolbar">
        {#if imgHeightApplies}
          <span class="tool" title="Image height %"><StretchVertical size={14} /><input aria-label="Image height %" type="number" min="5" max="95"
            value={template?.imageHeightPercent ?? 50} onchange={onImageHeight} /></span>
        {/if}
        <span class="tool" title="Image fit"><ScanLine size={14} />
          <select aria-label="Fit" value={s.image.backgroundSize} onchange={(e) => setSettings({ image: { ...s.image, backgroundSize: str(e) } })}>
            {#each ['cover','contain','auto'] as v (v)}<option value={v}>{v}</option>{/each}
          </select>
        </span>
        <span class="tool" title="Image position"><MoveVertical size={14} />
          <select aria-label="Position" value={s.image.backgroundPosition} onchange={(e) => setSettings({ image: { ...s.image, backgroundPosition: str(e) } })}>
            {#each ['center','top','bottom','left','right'] as v (v)}<option value={v}>{v}</option>{/each}
          </select>
        </span>
      </div>
    </div>
  {/if}
</div>

{#snippet fontTools(f: FontSpec, patch: (p: Partial<FontSpec>) => void)}
  <div class="toolbar">
    <span class="tool" title="Font family"><Type size={14} />
      <select aria-label="Family" value={f.family} onchange={(e) => patch({ family: str(e) })}>
        {#each FONT_FAMILIES as fam (fam)}<option value={fam}>{fam}</option>{/each}
      </select>
    </span>
    <span class="tool" title="Font size"><ALargeSmall size={14} /><input aria-label="Size" type="number" min="1" value={f.size}
      onchange={(e) => patch({ size: num(e) })} /></span>
    <span class="tool" title="Weight"><Bold size={14} />
      <select aria-label="Weight" value={f.weight ?? 400} onchange={(e) => patch({ weight: num(e) })}>
        {#each WEIGHTS as w (w.v)}<option value={w.v}>{w.label}</option>{/each}
      </select>
    </span>
    <span class="tool" title="Line height"><StretchVertical size={14} /><input aria-label="Line height" type="number" min="0.5" step="0.1" value={f.lineHeight}
      onchange={(e) => patch({ lineHeight: num(e) })} /></span>
    <span class="tool" title="Text color"><input aria-label="Color" type="color" value={f.color}
      oninput={(e) => patch({ color: str(e) })} /></span>
    <div class="seg" title="Text align">
      {#each ALIGNS as a (a)}
        {@const Icon = ALIGN_ICON[a]}
        <button type="button" class:on={(f.textAlign ?? 'left') === a} aria-label={`align ${a}`}
          onclick={() => patch({ textAlign: a })}><Icon size={14} /></button>
      {/each}
    </div>
  </div>
{/snippet}

<style>
  .style-controls { display:flex; flex-direction:column; height:150px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  .tabs { display:flex; gap:2px; padding:6px 10px 0; border-bottom:1px solid var(--border); flex:none; }
  .tabs button { border:none; background:transparent; color:var(--text-muted); font:inherit; font-size:12px; font-weight:600;
    padding:6px 12px; border-radius:6px 6px 0 0; border-bottom:2px solid transparent; cursor:pointer; margin-bottom:-1px;
    transition:color .12s ease, border-color .12s ease; }
  .tabs button:hover:not(.on) { color:var(--accent); }
  .tabs button.on { color:var(--accent); border-bottom-color:var(--accent); }
  .subtabs { display:flex; gap:4px; padding:8px 10px 0; flex:none; }
  .subtabs button { border:1px solid var(--border); background:var(--bg); color:var(--text-muted); font:inherit; font-size:11px;
    padding:3px 10px; border-radius:999px; cursor:pointer; transition:background .12s ease, color .12s ease, border-color .12s ease; }
  .subtabs button:hover:not(.on) { border-color:var(--accent); color:var(--accent); }
  .subtabs button.on { background:var(--accent); border-color:var(--accent); color:#fff; }
  .tabs button:focus-visible, .subtabs button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }

  .panel { flex:1; min-height:0; overflow:auto; padding:10px; }
  .hint { font-size:11px; color:var(--text-muted); align-self:center; }
  /* Compact horizontal icon toolbar — each control is an icon + a small input/select. */
  .toolbar { display:flex; flex-wrap:wrap; gap:6px 8px; align-content:flex-start; }
  .tool { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border); border-radius:7px;
    padding:3px 7px; background:var(--bg); color:var(--text-muted); }
  .tool:hover { border-color:var(--accent); }
  .tool :global(svg) { flex:none; color:var(--text-muted); }
  .tool input, .tool select { border:none; background:transparent; color:var(--text); font:inherit; font-size:12px; padding:0; }
  .tool input:focus-visible, .tool select:focus-visible { outline:none; }
  .tool:focus-within { border-color:var(--accent); outline:2px solid var(--accent); outline-offset:-1px; }
  .tool input[type=number] { width:42px; }
  .tool select { max-width:112px; cursor:pointer; }
  .tool input[type=color] { width:24px; height:20px; padding:0; border:none; background:none; cursor:pointer; }

  .seg { display:inline-flex; border:1px solid var(--border); border-radius:7px; overflow:hidden; }
  .seg button { border:none; background:transparent; color:var(--text-muted); padding:4px 8px; cursor:pointer;
    display:inline-flex; align-items:center; transition:background .12s ease, color .12s ease; }
  .seg button:not(:last-child) { border-right:1px solid var(--border); }
  .seg button:hover:not(.on) { background:var(--accent-weak); color:var(--accent); }
  .seg button.on { background:var(--accent); color:#fff; }
  .seg button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
</style>
