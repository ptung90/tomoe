<!-- src/lib/modules/menu/TemplateEditor.svelte -->
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import ChevronUp from 'lucide-svelte/icons/chevron-up';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import * as S from './stores';
  const doc = S.doc;
  function close() { S.templateEditorOpen.set(false); }
  let panel = $state<HTMLElement>();
  $effect(() => { panel?.focus(); });
</script>

<div class="backdrop" role="presentation" onclick={close}>
  <div class="panel" bind:this={panel} role="dialog" aria-modal="true" aria-label="Sửa cấu trúc" tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && close()}>
    <header><h2>Cấu trúc thực đơn</h2><button class="icon" aria-label="Đóng" onclick={close}><X size={18} /></button></header>
    <label class="days">Các ngày (cách nhau bằng dấu phẩy)
      <input value={$doc.template.days.join(', ')}
        onchange={(e) => S.setDays((e.currentTarget as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean))} />
    </label>
    {#each $doc.template.periods as period (period.id)}
      <fieldset>
        <legend>
          <input value={period.label} onchange={(e) => S.renamePeriod(period.id, (e.currentTarget as HTMLInputElement).value)} />
          <button class="icon" aria-label="Xóa buổi" onclick={() => S.removePeriod(period.id)}><Trash2 size={15} /></button>
        </legend>
        {#each period.categories as cat (cat.id)}
          <div class="cat">
            <input class="lbl" value={cat.label} onchange={(e) => S.renameCategory(cat.id, (e.currentTarget as HTMLInputElement).value)} />
            <input class="key" value={cat.key} title="mã nhóm (gắn món)" onchange={(e) => S.setCategoryKey(cat.id, (e.currentTarget as HTMLInputElement).value)} />
            <input class="dv" placeholder="mặc định" value={cat.defaultValue ?? ''} onchange={(e) => S.setCategoryFlag(cat.id, { defaultValue: (e.currentTarget as HTMLInputElement).value || undefined })} />
            <label title="Ẩn nhãn"><input type="checkbox" checked={!!cat.hideLabel} onchange={(e) => S.setCategoryFlag(cat.id, { hideLabel: (e.currentTarget as HTMLInputElement).checked })} /> ẩn</label>
            <label title="Cân bằng nguyên liệu"><input type="checkbox" checked={!!cat.balanceByIngredient} onchange={(e) => S.setCategoryFlag(cat.id, { balanceByIngredient: (e.currentTarget as HTMLInputElement).checked })} /> cân bằng</label>
            <button class="icon" aria-label="Lên" onclick={() => S.moveCategory(cat.id, -1)}><ChevronUp size={14} /></button>
            <button class="icon" aria-label="Xuống" onclick={() => S.moveCategory(cat.id, 1)}><ChevronDown size={14} /></button>
            <button class="icon" aria-label="Xóa nhóm" onclick={() => S.removeCategory(cat.id)}><Trash2 size={14} /></button>
          </div>
        {/each}
        <button class="add" onclick={() => S.addCategory(period.id)}>+ Nhóm món</button>
      </fieldset>
    {/each}
    <button class="add" onclick={() => S.addPeriod()}>+ Buổi</button>
  </div>
</div>

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:50; }
  .panel { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px; padding:16px 20px; width:min(720px,92vw); max-height:88vh; overflow:auto; }
  header { display:flex; align-items:center; justify-content:space-between; }
  h2 { margin:0 0 4px; font-size:16px; }
  fieldset { border:1px solid var(--border); border-radius:8px; margin:10px 0; padding:8px 10px; }
  legend { display:flex; gap:6px; align-items:center; }
  .cat { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:4px 0; }
  input { border:1px solid var(--border); border-radius:6px; padding:4px 6px; background:var(--bg); color:var(--text); font:inherit; }
  .lbl { width:130px; } .key { width:90px; } .dv { width:110px; }
  .icon { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:3px; border-radius:5px; }
  .icon:hover { background:var(--accent-weak); color:var(--accent); }
  .add { border:1px dashed var(--border); background:transparent; color:var(--accent); border-radius:6px; padding:5px 10px; cursor:pointer; font:inherit; }
</style>
