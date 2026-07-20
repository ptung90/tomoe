<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import Copy from 'lucide-svelte/icons/copy';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Settings2 from 'lucide-svelte/icons/settings-2';
  import * as S from './stores';
  import { cellKey } from './model';
  import TemplateEditor from './TemplateEditor.svelte';

  const doc = S.doc;
  const selectedWeekId = S.selectedWeekId;
  const templateEditorOpen = S.templateEditorOpen;

  const current = $derived($doc.weeks.find((w) => w.id === $selectedWeekId) ?? null);
</script>

<div class="menu-ws">
  <aside class="weeks">
    <button class="primary" onclick={() => S.addWeek()}><Plus size={15} /> Thêm tuần</button>
    <button onclick={() => S.templateEditorOpen.set(true)}><Settings2 size={15} /> Cấu trúc</button>
    <ul>
      {#each $doc.weeks as w (w.id)}
        <li class:active={w.id === $selectedWeekId}>
          <button class="wk" onclick={() => S.selectWeek(w.id)}>{w.title}</button>
          <button class="icon" aria-label="Nhân bản" onclick={() => S.duplicateWeek(w.id)}><Copy size={13} /></button>
          <button class="icon" aria-label="Xóa" onclick={() => S.deleteWeek(w.id)}><Trash2 size={13} /></button>
        </li>
      {/each}
    </ul>
  </aside>

  <section class="editor">
    {#if current}
      <input class="title" value={current.title}
        onchange={(e) => S.setWeekTitle(current.id, (e.currentTarget as HTMLInputElement).value)} />
      <div class="grid" style={`grid-template-columns: 120px 120px repeat(${$doc.template.days.length}, 1fr);`}>
        <div class="h"></div><div class="h"></div>
        {#each $doc.template.days as d}<div class="h">{d}</div>{/each}
        {#each $doc.template.periods as period (period.id)}
          {#each period.categories as cat, i (cat.id)}
            <div class="h period">{i === 0 ? period.label : ''}</div>
            <div class="h">{cat.hideLabel ? '' : cat.label}</div>
            {#each $doc.template.days as _d, day}
              <input class="cell" value={current.cells[cellKey(cat.id, day)] ?? ''}
                oninput={(e) => S.setCell(current.id, cat.id, day, (e.currentTarget as HTMLInputElement).value)} />
            {/each}
          {/each}
        {/each}
      </div>
    {:else}
      <div class="empty">Chưa có tuần nào. Bấm <strong>Thêm tuần</strong> để bắt đầu.</div>
    {/if}
  </section>
</div>

{#if $templateEditorOpen}<TemplateEditor />{/if}

<style>
  .menu-ws { flex:1; display:flex; min-height:0; background:var(--bg); color:var(--text); }
  .weeks { width:220px; border-right:1px solid var(--border); padding:12px; display:flex; flex-direction:column; gap:8px; overflow:auto; }
  .weeks ul { list-style:none; margin:8px 0 0; padding:0; display:flex; flex-direction:column; gap:2px; }
  .weeks li { display:flex; align-items:center; gap:2px; border-radius:6px; }
  .weeks li.active { background:var(--accent-weak); }
  .wk { flex:1; text-align:left; border:none; background:transparent; color:var(--text); font:inherit; padding:6px 8px; cursor:pointer; border-radius:6px; }
  .weeks button.primary { background:var(--accent); color:#fff; }
  .weeks > button { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border); background:transparent; color:var(--text); border-radius:8px; padding:7px 10px; cursor:pointer; font:inherit; }
  .icon { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:4px; border-radius:5px; }
  .icon:hover { background:var(--accent-weak); color:var(--accent); }
  .editor { flex:1; padding:16px; overflow:auto; }
  .title { font-size:18px; font-weight:700; border:1px solid transparent; background:transparent; color:var(--text); width:100%; padding:4px 6px; border-radius:6px; }
  .title:hover, .title:focus { border-color:var(--border); }
  .grid { display:grid; gap:1px; background:var(--border); border:1px solid var(--border); margin-top:12px; }
  .grid .h { background:var(--surface); padding:6px 8px; font-weight:600; font-size:13px; display:flex; align-items:center; }
  .grid .period { justify-content:center; }
  .cell { border:none; background:var(--bg); color:var(--text); padding:6px 8px; font:inherit; font-size:13px; }
  .cell:focus { outline:2px solid var(--accent); outline-offset:-2px; }
  .empty { color:var(--text-muted); margin-top:40px; text-align:center; }
</style>
