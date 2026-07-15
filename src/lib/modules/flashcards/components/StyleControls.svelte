<script lang="ts">
  import Type from 'lucide-svelte/icons/type';
  import ALargeSmall from 'lucide-svelte/icons/a-large-small';
  import Bold from 'lucide-svelte/icons/bold';
  import StretchVertical from 'lucide-svelte/icons/stretch-vertical';
  import AlignLeft from 'lucide-svelte/icons/align-left';
  import AlignCenter from 'lucide-svelte/icons/align-center';
  import AlignRight from 'lucide-svelte/icons/align-right';
  import AlignJustify from 'lucide-svelte/icons/align-justify';
  import Square from 'lucide-svelte/icons/square';
  import SquareDashed from 'lucide-svelte/icons/square-dashed';
  import Spline from 'lucide-svelte/icons/spline';
  import ScanLine from 'lucide-svelte/icons/scan-line';
  import ImageIcon from 'lucide-svelte/icons/image';
  import MoveVertical from 'lucide-svelte/icons/move-vertical';
  import LayoutGrid from 'lucide-svelte/icons/layout-grid';
  import X from 'lucide-svelte/icons/x';
  import Globe from 'lucide-svelte/icons/globe';
  import Layers from 'lucide-svelte/icons/layers';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import {
    project, selectedRecordId, setSettings, setTemplateLayout,
    setTemplateStyle, setCardStyle, clearStyleOverride, resetScopeStyle,
  } from '../stores';
  import { deriveAutoTemplate } from '../cardMapping';
  import { sheetLayout } from '../lib/card-render';
  import { resolveStyle } from '../lib/style';
  import type { FontSpec, StyleOverrides } from '../model';

  const num = (e: Event) => Number((e.target as HTMLInputElement).value);
  const str = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;

  const FONT_FAMILIES = ['Lexend', 'sans-serif', 'serif', 'monospace', 'Georgia', 'Arial', 'Times New Roman', 'Courier New'];
  const WEIGHTS: { v: number; label: string }[] = [
    { v: 400, label: 'Normal' }, { v: 500, label: 'Medium' }, { v: 600, label: 'Semibold' }, { v: 700, label: 'Bold' },
  ];
  const ALIGNS = ['left', 'center', 'right', 'justify'] as const;
  const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify };

  // Image-area height is a per-schema template property; resolve it from the selected record.
  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((x) => x.id === record.schemaId) ?? null) : null);
  const template = $derived(schema ? (schema.cardTemplates[0] ?? deriveAutoTemplate(schema)) : null);
  // The selected record's packed card (if it has been generated) — style overrides can only be written
  // onto a real card, so "This card" scope is only available once one exists.
  const card = $derived(record ? ($project.cards.find((c) => c.recordId === record.id) ?? null) : null);
  const imgHeightApplies = $derived(!!template && template.layout !== 'fulltext' && template.layout !== 'fullimage');

  // ── Cascade scope: Global (settings) → This type (template.style) → This card (card.style) ──
  let scope = $state<'global' | 'schema' | 'card'>('global');
  const eff = $derived(resolveStyle($project.settings, template?.style, card?.style));
  // The override object at the CURRENT scope — used to show "set here" vs "inherited" + drive reset.
  const scopeStyle = $derived<StyleOverrides | undefined>(
    scope === 'global' ? undefined : scope === 'schema' ? template?.style : card?.style,
  );
  function write(patch: StyleOverrides): void {
    if (scope === 'global') setSettings(patch);
    else if (scope === 'schema' && schema) setTemplateStyle(schema.id, patch);
    else if (scope === 'card' && card) setCardStyle(card.id, patch);
  }
  function hasOverride(key: keyof StyleOverrides): boolean {
    return scope !== 'global' && !!scopeStyle && scopeStyle[key] !== undefined;
  }
  function resetOverride(key: keyof StyleOverrides): void {
    if (scope === 'schema' && schema) clearStyleOverride('schema', schema.id, key);
    else if (scope === 'card' && card) clearStyleOverride('card', card.id, key);
  }
  // How many properties are overridden at the current scope, and a plain-language description of it.
  const overrideCount = $derived(scopeStyle ? Object.keys(scopeStyle).length : 0);
  const scopeHint = $derived(
    scope === 'global'
      ? 'Base style — applies to every card.'
      : scope === 'schema'
        ? `“${schema?.name ?? 'this type'}” · blank fields inherit Global`
        : 'This card only · blank fields inherit its type',
  );
  function resetScope(): void {
    if (scope === 'schema' && schema) resetScopeStyle('schema', schema.id);
    else if (scope === 'card' && card) resetScopeStyle('card', card.id);
  }
  function onImageHeight(e: Event) {
    if (!schema) return;
    const v = Math.round(Number((e.target as HTMLInputElement).value)) || 50;
    setTemplateLayout(schema.id, { imageHeightPercent: Math.min(95, Math.max(5, v)) });
  }

  // Cards/page (N-up tiling): Fixed grid (cardsPerPage) or Auto-fit (real-size cardSize).
  const orient = $derived(eff.orientation);
  const resolvedPerPage = $derived(template ? sheetLayout(template, eff.paperSize, orient).perPage : 0);
  const CARDS_PER_PAGE = [1, 2, 3, 4, 6, 8, 9, 12];
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
  // Fields: show/hide the card title (first text field) and the "• label:" prefix on each field.
  function onShowTitle(e: Event) {
    if (schema) setTemplateLayout(schema.id, { hideTitle: !(e.target as HTMLInputElement).checked });
  }
  function onShowLabels(e: Event) {
    if (schema) setTemplateLayout(schema.id, { hideSectionLabels: !(e.target as HTMLInputElement).checked });
  }

  let tab = $state<'text' | 'card' | 'image'>('text');
  let textSub = $state<'title' | 'content'>('title');
  let cardSub = $state<'border' | 'spacing' | 'page' | 'fields'>('border');
</script>

<div class="style-controls">
  <div class="scope-row">
    <span class="scope-label">Style for</span>
    <div class="scope-switch" role="tablist" aria-label="Style scope">
      <button type="button" role="tab" aria-selected={scope === 'global'} class:on={scope === 'global'}
        onclick={() => (scope = 'global')}><Globe size={13} />Global</button>
      <button type="button" role="tab" aria-selected={scope === 'schema'} class:on={scope === 'schema'}
        disabled={!schema} onclick={() => (scope = 'schema')}><Layers size={13} />This type</button>
      <button type="button" role="tab" aria-selected={scope === 'card'} class:on={scope === 'card'}
        disabled={!card} onclick={() => (scope = 'card')}><Square size={13} />This card</button>
    </div>
  </div>
  <div class="scope-hint">
    <span class="scope-hint-text">{scopeHint}</span>
    {#if scope !== 'global'}
      <span class="scope-count" class:none={overrideCount === 0}>
        {overrideCount ? `${overrideCount} set here` : 'all inherited'}
      </span>
      <button type="button" class="reset-all" disabled={overrideCount === 0}
        aria-label={`Reset all ${scope === 'schema' ? 'This type' : 'This card'} overrides`}
        onclick={resetScope}><RotateCcw size={12} />Reset</button>
    {/if}
  </div>
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
        {@render fontTools(eff.titleFont, 'titleFont', (p) => write({ titleFont: p }))}
      {:else}
        {@render fontTools(eff.contentFont, 'contentFont', (p) => write({ contentFont: p }))}
      {/if}
    </div>
  {:else if tab === 'card'}
    <div class="subtabs" role="tablist" aria-label="Card target">
      <button type="button" role="tab" aria-selected={cardSub === 'border'} class:on={cardSub === 'border'} onclick={() => (cardSub = 'border')}>Border</button>
      <button type="button" role="tab" aria-selected={cardSub === 'spacing'} class:on={cardSub === 'spacing'} onclick={() => (cardSub = 'spacing')}>Spacing</button>
      <button type="button" role="tab" aria-selected={cardSub === 'page'} class:on={cardSub === 'page'} onclick={() => (cardSub = 'page')}>Page</button>
      <button type="button" role="tab" aria-selected={cardSub === 'fields'} class:on={cardSub === 'fields'} onclick={() => (cardSub = 'fields')}>Fields</button>
    </div>
    <div class="panel" role="tabpanel">
      {#if cardSub === 'border'}
        <div class="toolbar">
          <span class="tool" title="Border width"><Square size={14} /><input aria-label="Width" type="number" min="0" value={eff.border.width}
            onchange={(e) => write({ border: { width: num(e) } })} /></span>
          <span class="tool" title="Border style"><SquareDashed size={14} />
            <select aria-label="Style" value={eff.border.style} onchange={(e) => write({ border: { style: str(e) } })}>
              {#each ['solid','dashed','dotted','double','none'] as st (st)}<option value={st}>{st}</option>{/each}
            </select>
          </span>
          <span class="tool" title="Border color"><input aria-label="Border color" type="color" value={eff.border.color}
            oninput={(e) => write({ border: { color: str(e) } })} /></span>
          <span class="tool" title="Corner radius"><Spline size={14} /><input aria-label="Radius" type="number" min="0" value={eff.border.radius}
            onchange={(e) => write({ border: { radius: num(e) } })} /></span>
          {@render resetBtn('border')}
        </div>
      {:else if cardSub === 'spacing'}
        <div class="toolbar">
          <span class="tool" title="Card margin (mm)"><ScanLine size={14} /><input aria-label="Card margin (mm)" type="number" min="0" value={eff.margin}
            onchange={(e) => write({ margin: num(e) })} /></span>
          {@render resetBtn('margin')}
          <span class="tool" title="Padding (mm)"><SquareDashed size={14} /><input aria-label="Padding (mm)" type="number" min="0" value={eff.padding}
            onchange={(e) => write({ padding: num(e) })} /></span>
          {@render resetBtn('padding')}
          <span class="tool" title="Image padding (mm)"><ImageIcon size={14} /><input aria-label="Image padding (mm)" type="number" min="0" value={eff.imgPadding}
            onchange={(e) => write({ imgPadding: num(e) })} /></span>
          {@render resetBtn('imgPadding')}
          <span class="tool" title="Vertical text align"><MoveVertical size={14} />
            <select aria-label="Vertical text align" value={eff.textVAlign} onchange={(e) => write({ textVAlign: str(e) as 'top'|'middle'|'bottom' })}>
              {#each ['top','middle','bottom'] as v (v)}<option value={v}>{v}</option>{/each}
            </select>
          </span>
          {@render resetBtn('textVAlign')}
        </div>
      {:else if cardSub === 'page'}
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
            <span class="hint">≈ {resolvedPerPage}/page</span>
          {/if}
        </div>
      {:else}
        <div class="toolbar">
          <label class="tool" title="Show the card title (the record's first text field)">
            <input type="checkbox" aria-label="Show title" checked={!template?.hideTitle} disabled={!schema} onchange={onShowTitle} /> Title
          </label>
          <label class="tool" title="Show the “• label:” prefix before each field's value">
            <input type="checkbox" aria-label="Show field labels" checked={!template?.hideSectionLabels} disabled={!schema} onchange={onShowLabels} /> Labels
          </label>
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
          <select aria-label="Fit" value={eff.image.backgroundSize} onchange={(e) => write({ image: { backgroundSize: str(e) } })}>
            {#each ['cover','contain','auto'] as v (v)}<option value={v}>{v}</option>{/each}
          </select>
        </span>
        <span class="tool" title="Image position"><MoveVertical size={14} />
          <select aria-label="Position" value={eff.image.backgroundPosition} onchange={(e) => write({ image: { backgroundPosition: str(e) } })}>
            {#each ['center','top','bottom','left','right'] as v (v)}<option value={v}>{v}</option>{/each}
          </select>
        </span>
        {@render resetBtn('image')}
      </div>
    </div>
  {/if}
</div>

{#snippet resetBtn(key: keyof StyleOverrides)}
  {#if hasOverride(key)}
    <button type="button" class="reset" title="Reset to inherited" aria-label={`Reset ${key}`} onclick={() => resetOverride(key)}>
      <X size={12} />
    </button>
  {/if}
{/snippet}

{#snippet fontTools(f: FontSpec, key: 'titleFont' | 'contentFont', patch: (p: Partial<FontSpec>) => void)}
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
    {@render resetBtn(key)}
  </div>
{/snippet}

<style>
  .style-controls { display:flex; flex-direction:column; height:186px;
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
  .tool input[type=checkbox] { width:15px; height:15px; cursor:pointer; accent-color:var(--accent); }

  .seg { display:inline-flex; border:1px solid var(--border); border-radius:7px; overflow:hidden; }
  .seg button { border:none; background:transparent; color:var(--text-muted); padding:4px 8px; cursor:pointer;
    display:inline-flex; align-items:center; transition:background .12s ease, color .12s ease; }
  .seg button:not(:last-child) { border-right:1px solid var(--border); }
  .seg button:hover:not(.on) { background:var(--accent-weak); color:var(--accent); }
  .seg button.on { background:var(--accent); color:#fff; }
  .seg button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }

  /* Scope switcher — the "level" selector: which of Global / This type / This card the edits below target. */
  .scope-row { display:flex; align-items:center; gap:8px; padding:7px 10px 0; flex:none; }
  .scope-label { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--text-muted); flex:none; }
  .scope-switch { display:flex; flex:1; border:1px solid var(--border); border-radius:7px; overflow:hidden; background:var(--bg); }
  .scope-switch button { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:4px;
    border:none; background:transparent; color:var(--text-muted); font:inherit; font-size:11px; font-weight:600;
    padding:5px 6px; cursor:pointer; transition:background .12s ease, color .12s ease; }
  .scope-switch button:not(:last-child) { border-right:1px solid var(--border); }
  .scope-switch button:hover:not(.on):not(:disabled) { background:var(--accent-weak); color:var(--accent); }
  .scope-switch button.on { background:var(--accent); color:#fff; }
  .scope-switch button:disabled { opacity:.38; cursor:not-allowed; }
  .scope-switch button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }

  /* Plain-language description of the active scope + its override count + a reset-all affordance. */
  .scope-hint { display:flex; align-items:center; gap:8px; padding:5px 10px 7px; flex:none;
    border-bottom:1px solid var(--border); font-size:11px; color:var(--text-muted); }
  .scope-hint-text { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .scope-count { flex:none; font-weight:600; color:var(--accent); }
  .scope-count.none { color:var(--text-muted); font-weight:400; }
  .reset-all { flex:none; display:inline-flex; align-items:center; gap:3px; border:1px solid var(--border); border-radius:6px;
    background:var(--bg); color:var(--text-muted); font:inherit; font-size:11px; font-weight:600; padding:2px 7px; cursor:pointer;
    transition:background .12s ease, color .12s ease, border-color .12s ease; }
  .reset-all:hover:not(:disabled) { border-color:var(--accent); color:var(--accent); }
  .reset-all:disabled { opacity:.38; cursor:not-allowed; }
  .reset-all:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }

  /* Reset-to-inherited — shown next to a group's controls once this scope has its own override.
     Accent-tinted so "set here" groups are visually distinct from inherited ones. */
  .reset { display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; flex:none;
    border:1px solid var(--accent); border-radius:6px; background:var(--accent-weak); color:var(--accent); cursor:pointer;
    transition:background .12s ease, color .12s ease; }
  .reset:hover { background:var(--accent); color:#fff; }
  .reset:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
</style>
