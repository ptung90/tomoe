<script lang="ts">
  import { project, setSettings } from '../stores';

  const s = $derived($project.settings);
  const num = (e: Event) => Number((e.target as HTMLInputElement).value);
  const str = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
</script>

<div class="style-controls">
  <fieldset>
    <legend>Border</legend>
    <label>Border width <input type="number" min="0" value={s.border.width}
      onchange={(e) => setSettings({ border: { ...s.border, width: num(e) } })} /></label>
    <label>Style
      <select value={s.border.style} onchange={(e) => setSettings({ border: { ...s.border, style: str(e) } })}>
        {#each ['solid','dashed','dotted','double','none'] as st (st)}<option value={st}>{st}</option>{/each}
      </select>
    </label>
    <label>Color <input type="color" value={s.border.color}
      oninput={(e) => setSettings({ border: { ...s.border, color: str(e) } })} /></label>
    <label>Radius <input type="number" min="0" value={s.border.radius}
      onchange={(e) => setSettings({ border: { ...s.border, radius: num(e) } })} /></label>
  </fieldset>

  <fieldset>
    <legend>Title font</legend>
    <label>Title font size <input type="number" min="1" value={s.titleFont.size}
      onchange={(e) => setSettings({ titleFont: { ...s.titleFont, size: num(e) } })} /></label>
    <label>Color <input type="color" value={s.titleFont.color}
      oninput={(e) => setSettings({ titleFont: { ...s.titleFont, color: str(e) } })} /></label>
  </fieldset>

  <fieldset>
    <legend>Content font</legend>
    <label>Content font size <input type="number" min="1" value={s.contentFont.size}
      onchange={(e) => setSettings({ contentFont: { ...s.contentFont, size: num(e) } })} /></label>
    <label>Color <input type="color" value={s.contentFont.color}
      oninput={(e) => setSettings({ contentFont: { ...s.contentFont, color: str(e) } })} /></label>
  </fieldset>
</div>

<style>
  .style-controls { display:flex; flex-direction:column; gap:10px; padding:10px 12px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  fieldset { border:1px solid var(--border); border-radius:8px; padding:8px 10px; display:flex; flex-wrap:wrap; gap:8px; }
  legend { font-size:11px; font-weight:600; color:var(--text-muted); padding:0 4px; }
  label { display:inline-flex; align-items:center; gap:5px; font-size:12px; color:var(--text); }
  input[type=number] { width:56px; }
  input, select { border:1px solid var(--border); border-radius:6px; padding:3px 6px;
    background:var(--bg); color:var(--text); font:inherit; font-size:12px; }
  input[type=color] { padding:0; width:34px; height:24px; }
</style>
