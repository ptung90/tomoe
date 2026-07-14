<script lang="ts">
  import { project, setSettings } from '../stores';

  const s = $derived($project.settings);
  const num = (e: Event) => Number((e.target as HTMLInputElement).value);
  const str = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
</script>

<div class="style-controls">
  <div class="group">
    <span class="group-title">Border</span>
    <div class="rows">
      <label class="row"><span>Border width</span><input type="number" min="0" value={s.border.width}
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
  </div>

  <div class="group">
    <span class="group-title">Title font</span>
    <div class="rows">
      <label class="row"><span>Title font size</span><input type="number" min="1" value={s.titleFont.size}
        onchange={(e) => setSettings({ titleFont: { ...s.titleFont, size: num(e) } })} /></label>
      <label class="row"><span>Color</span><input type="color" value={s.titleFont.color}
        oninput={(e) => setSettings({ titleFont: { ...s.titleFont, color: str(e) } })} /></label>
    </div>
  </div>

  <div class="group">
    <span class="group-title">Content font</span>
    <div class="rows">
      <label class="row"><span>Content font size</span><input type="number" min="1" value={s.contentFont.size}
        onchange={(e) => setSettings({ contentFont: { ...s.contentFont, size: num(e) } })} /></label>
      <label class="row"><span>Color</span><input type="color" value={s.contentFont.color}
        oninput={(e) => setSettings({ contentFont: { ...s.contentFont, color: str(e) } })} /></label>
    </div>
  </div>
</div>

<style>
  .style-controls { display:flex; flex-direction:column; gap:14px; padding:12px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  .group { display:flex; flex-direction:column; gap:6px; }
  .group-title { font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
    color:var(--text-muted); }
  .rows { display:flex; flex-direction:column; gap:6px; }
  .row { display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px;
    font-size:12px; color:var(--text); }
  .row input, .row select { border:1px solid var(--border); border-radius:6px; padding:3px 7px;
    background:var(--bg); color:var(--text); font:inherit; font-size:12px; transition:border-color .12s ease; }
  .row input:hover, .row select:hover { border-color:var(--accent); }
  .row input:focus-visible, .row select:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .row input[type=number] { width:64px; justify-self:end; }
  .row input[type=color] { padding:0; width:40px; height:26px; justify-self:end; cursor:pointer; }
</style>
