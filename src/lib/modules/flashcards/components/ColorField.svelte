<script lang="ts">
  import { CONTINENT_COLORS } from '../lib/palette';
  import { continentColors } from '../stores';

  let { value, oninput, ariaLabel, disabled = false }: {
    value: string; oninput: (hex: string) => void; ariaLabel: string; disabled?: boolean;
  } = $props();

  const CUSTOM = '__custom__';
  const norm = (h: string) => (h || '').toLowerCase();
  // Effective presets: continent (English) label + the user's remapped color (or the default).
  const presets = $derived(CONTINENT_COLORS.map((c) => ({ key: c.key, label: c.en, hex: $continentColors[c.key] ?? c.hex })));
  // Reflect the current color: a matching continent, else "Custom…".
  const selectValue = $derived(presets.find((p) => norm(p.hex) === norm(value))?.hex ?? CUSTOM);

  function onSelect(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    if (v !== CUSTOM) oninput(v);   // picking "Custom…" leaves the current color; use the swatch to change it
  }
</script>

<span class="colorfield">
  <select class="preset" aria-label={`${ariaLabel} preset`} value={selectValue} onchange={onSelect} {disabled}>
    {#each presets as p (p.key)}<option value={p.hex}>{p.label}</option>{/each}
    <option value={CUSTOM}>Custom…</option>
  </select>
  <input class="swatch" type="color" aria-label={ariaLabel} value={value} {disabled}
    oninput={(e) => oninput((e.target as HTMLInputElement).value)} />
</span>

<style>
  .colorfield { display:inline-flex; align-items:center; gap:4px; }
  .preset { border:none; background:transparent; color:var(--text); font:inherit; font-size:12px; padding:0;
    max-width:104px; cursor:pointer; }
  .preset:disabled { opacity:.5; cursor:default; }
  .swatch { width:24px; height:20px; padding:0; border:none; background:none; cursor:pointer; }
  .swatch:disabled { opacity:.5; cursor:default; }
</style>
