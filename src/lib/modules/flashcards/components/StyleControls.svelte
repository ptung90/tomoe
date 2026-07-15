<script lang="ts">
  import AlignLeft from 'lucide-svelte/icons/align-left';
  import AlignCenter from 'lucide-svelte/icons/align-center';
  import AlignRight from 'lucide-svelte/icons/align-right';
  import { project, setSettings } from '../stores';
  import type { FontSpec } from '../model';

  const s = $derived($project.settings);
  const num = (e: Event) => Number((e.target as HTMLInputElement).value);
  const str = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
  const bool = (e: Event) => (e.target as HTMLInputElement).checked;

  const FONT_FAMILIES = ['Lexend', 'sans-serif', 'serif', 'monospace', 'Georgia', 'Arial', 'Times New Roman', 'Courier New'];
  const WEIGHTS: { v: number; label: string }[] = [
    { v: 400, label: 'Normal' }, { v: 500, label: 'Medium' }, { v: 600, label: 'Semibold' }, { v: 700, label: 'Bold' },
  ];
  const ALIGNS = ['left', 'center', 'right'] as const;
  const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight };

  let tab = $state<'text' | 'card' | 'image'>('text');
  let textSub = $state<'title' | 'content'>('title');
  let cardSub = $state<'border' | 'spacing'>('border');
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
        {@render fontRows(s.titleFont, (p) => setSettings({ titleFont: { ...s.titleFont, ...p } }))}
      {:else}
        {@render fontRows(s.contentFont, (p) => setSettings({ contentFont: { ...s.contentFont, ...p } }))}
      {/if}
    </div>
  {:else if tab === 'card'}
    <div class="subtabs" role="tablist" aria-label="Card target">
      <button type="button" role="tab" aria-selected={cardSub === 'border'} class:on={cardSub === 'border'} onclick={() => (cardSub = 'border')}>Border</button>
      <button type="button" role="tab" aria-selected={cardSub === 'spacing'} class:on={cardSub === 'spacing'} onclick={() => (cardSub = 'spacing')}>Spacing</button>
    </div>
    <div class="panel" role="tabpanel">
      {#if cardSub === 'border'}
        <div class="rows">
          <label class="row"><span>Width</span><input type="number" min="0" value={s.border.width}
            onchange={(e) => setSettings({ border: { ...s.border, width: num(e) } })} /></label>
          <label class="row"><span>Style</span>
            <select value={s.border.style} onchange={(e) => setSettings({ border: { ...s.border, style: str(e) } })}>
              {#each ['solid','dashed','dotted','double','none'] as st (st)}<option value={st}>{st}</option>{/each}
            </select>
          </label>
          <label class="row"><span>Color</span><input type="color" value={s.border.color}
            oninput={(e) => setSettings({ border: { ...s.border, color: str(e) } })} /></label>
          <label class="row"><span>Radius</span><input type="number" min="0" value={s.border.radius}
            onchange={(e) => setSettings({ border: { ...s.border, radius: num(e) } })} /></label>
        </div>
      {:else}
        <div class="rows">
          <label class="row"><span>Card margin (mm)</span><input type="number" min="0" value={s.margin}
            onchange={(e) => setSettings({ margin: num(e) })} /></label>
          <label class="row"><span>Padding (mm)</span><input type="number" min="0" value={s.padding}
            onchange={(e) => setSettings({ padding: num(e) })} /></label>
          <label class="row"><span>Image padding (mm)</span><input type="number" min="0" value={s.imgPadding}
            onchange={(e) => setSettings({ imgPadding: num(e) })} /></label>
          <label class="row"><span>Vertical text align</span>
            <select value={s.textVAlign} onchange={(e) => setSettings({ textVAlign: str(e) as 'top'|'middle'|'bottom' })}>
              {#each ['top','middle','bottom'] as v (v)}<option value={v}>{v}</option>{/each}
            </select>
          </label>
        </div>
      {/if}
    </div>
  {:else}
    <div class="panel" role="tabpanel">
      <div class="rows">
        <label class="row"><span>Fit</span>
          <select value={s.image.backgroundSize} onchange={(e) => setSettings({ image: { ...s.image, backgroundSize: str(e) } })}>
            {#each ['cover','contain','auto'] as v (v)}<option value={v}>{v}</option>{/each}
          </select>
        </label>
        <label class="row"><span>Position</span>
          <select value={s.image.backgroundPosition} onchange={(e) => setSettings({ image: { ...s.image, backgroundPosition: str(e) } })}>
            {#each ['center','top','bottom','left','right'] as v (v)}<option value={v}>{v}</option>{/each}
          </select>
        </label>
        <label class="row check"><span>3-card fit (fill height)</span><input type="checkbox" checked={s.threeCardFit}
          onchange={(e) => setSettings({ threeCardFit: bool(e) })} /></label>
      </div>
    </div>
  {/if}
</div>

{#snippet fontRows(f: FontSpec, patch: (p: Partial<FontSpec>) => void)}
  <div class="rows">
    <label class="row"><span>Family</span>
      <select value={f.family} onchange={(e) => patch({ family: str(e) })}>
        {#each FONT_FAMILIES as fam (fam)}<option value={fam}>{fam}</option>{/each}
      </select>
    </label>
    <label class="row"><span>Size</span><input type="number" min="1" value={f.size}
      onchange={(e) => patch({ size: num(e) })} /></label>
    <label class="row"><span>Weight</span>
      <select value={f.weight ?? 400} onchange={(e) => patch({ weight: num(e) })}>
        {#each WEIGHTS as w (w.v)}<option value={w.v}>{w.label}</option>{/each}
      </select>
    </label>
    <label class="row"><span>Line height</span><input type="number" min="0.5" step="0.1" value={f.lineHeight}
      onchange={(e) => patch({ lineHeight: num(e) })} /></label>
    <label class="row"><span>Color</span><input type="color" value={f.color}
      oninput={(e) => patch({ color: str(e) })} /></label>
    <div class="row"><span>Align</span>
      <div class="align-seg">
        {#each ALIGNS as a (a)}
          {@const Icon = ALIGN_ICON[a]}
          <button type="button" class:on={(f.textAlign ?? 'left') === a} aria-label={`align ${a}`}
            onclick={() => patch({ textAlign: a })}><Icon size={14} /></button>
        {/each}
      </div>
    </div>
  </div>
{/snippet}

<style>
  .style-controls { display:flex; flex-direction:column; background:var(--surface); border-bottom:1px solid var(--border); }
  .tabs { display:flex; gap:2px; padding:6px 10px 0; border-bottom:1px solid var(--border); }
  .tabs button { border:none; background:transparent; color:var(--text-muted); font:inherit; font-size:12px; font-weight:600;
    padding:6px 12px; border-radius:6px 6px 0 0; border-bottom:2px solid transparent; cursor:pointer; margin-bottom:-1px;
    transition:color .12s ease, border-color .12s ease; }
  .tabs button:hover:not(.on) { color:var(--accent); }
  .tabs button.on { color:var(--accent); border-bottom-color:var(--accent); }
  .subtabs { display:flex; gap:4px; padding:8px 10px 0; }
  .subtabs button { border:1px solid var(--border); background:var(--bg); color:var(--text-muted); font:inherit; font-size:11px;
    padding:3px 10px; border-radius:999px; cursor:pointer; transition:background .12s ease, color .12s ease, border-color .12s ease; }
  .subtabs button:hover:not(.on) { border-color:var(--accent); color:var(--accent); }
  .subtabs button.on { background:var(--accent); border-color:var(--accent); color:#fff; }
  .tabs button:focus-visible, .subtabs button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .panel { padding:10px; }
  .rows { display:flex; flex-direction:column; gap:6px; }
  .row { display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px; font-size:12px; color:var(--text); }
  .row input, .row select { border:1px solid var(--border); border-radius:6px; padding:3px 7px;
    background:var(--bg); color:var(--text); font:inherit; font-size:12px; transition:border-color .12s ease; }
  .row input:hover, .row select:hover { border-color:var(--accent); }
  .row input:focus-visible, .row select:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .row input[type=number] { width:70px; justify-self:end; }
  .row select { max-width:140px; justify-self:end; }
  .row input[type=color] { padding:0; width:40px; height:26px; justify-self:end; cursor:pointer; }
  .row.check input[type=checkbox] { justify-self:end; width:16px; height:16px; cursor:pointer; }
  .align-seg { justify-self:end; display:inline-flex; border:1px solid var(--border); border-radius:6px; overflow:hidden; }
  .align-seg button { border:none; background:transparent; color:var(--text-muted); padding:3px 8px; cursor:pointer;
    display:inline-flex; align-items:center; transition:background .12s ease, color .12s ease; }
  .align-seg button:not(:last-child) { border-right:1px solid var(--border); }
  .align-seg button:hover:not(.on) { background:var(--accent-weak); color:var(--accent); }
  .align-seg button.on { background:var(--accent); color:#fff; }
  .align-seg button:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
</style>
