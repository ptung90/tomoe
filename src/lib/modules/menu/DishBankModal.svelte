<!-- src/lib/modules/menu/DishBankModal.svelte -->
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Plus from 'lucide-svelte/icons/plus';
  import * as S from './stores';
  import { bank, addDish, updateDish, removeDish } from './dishBank';

  let name = $state('');
  let categoryKey = $state('man');
  let ingredientType = $state('');
  let panel = $state<HTMLElement>();
  $effect(() => { panel?.focus(); });

  function add() {
    if (!name.trim()) return;
    addDish({ name, categoryKey, ingredientType: ingredientType || undefined });
    name = ''; ingredientType = '';
  }
  function close() { S.dishBankOpen.set(false); }
  const grouped = $derived(Object.entries(
    $bank.reduce((m, d) => { (m[d.categoryKey] ??= []).push(d); return m; }, {} as Record<string, typeof $bank>)));
</script>

<div class="backdrop" role="presentation" onclick={close}>
  <div class="panel" bind:this={panel} role="dialog" aria-modal="true" aria-label="Kho món" tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && close()}>
    <header><h2>Kho món</h2><button class="icon" aria-label="Đóng" onclick={close}><X size={18} /></button></header>
    <div class="add-row">
      <input placeholder="Tên món" bind:value={name} />
      <input placeholder="nhóm (mã)" bind:value={categoryKey} class="k" />
      <input placeholder="nguyên liệu" bind:value={ingredientType} class="k" />
      <button class="primary" onclick={add}><Plus size={14} /> Thêm</button>
    </div>
    {#each grouped as [key, dishes] (key)}
      <h3>{key}</h3>
      <ul>
        {#each dishes as d (d.id)}
          <li>
            <input value={d.name} onchange={(e) => updateDish(d.id, { name: (e.currentTarget as HTMLInputElement).value })} />
            <input class="k" value={d.ingredientType ?? ''} placeholder="nguyên liệu"
              onchange={(e) => updateDish(d.id, { ingredientType: (e.currentTarget as HTMLInputElement).value || undefined })} />
            <button class="icon" aria-label="Xóa món" onclick={() => removeDish(d.id)}><Trash2 size={14} /></button>
          </li>
        {/each}
      </ul>
    {/each}
    <button class="harvest" onclick={() => S.harvestCurrentWeek()}>Gom món từ tuần hiện tại vào kho</button>
  </div>
</div>

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:50; }
  .panel { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px; padding:16px 20px; width:min(680px,92vw); max-height:88vh; overflow:auto; }
  header { display:flex; align-items:center; justify-content:space-between; }
  h2 { margin:0; font-size:16px; } h3 { margin:14px 0 4px; font-size:13px; color:var(--text-muted); text-transform:uppercase; }
  .add-row { display:flex; gap:6px; margin-top:10px; }
  ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:3px; }
  li { display:flex; gap:6px; align-items:center; }
  input { border:1px solid var(--border); border-radius:6px; padding:5px 7px; background:var(--bg); color:var(--text); font:inherit; flex:1; }
  input.k { flex:0 0 110px; }
  .primary { background:var(--accent); color:#fff; border:none; border-radius:6px; padding:5px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; }
  .icon { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:4px; border-radius:5px; }
  .icon:hover { background:var(--accent-weak); color:var(--accent); }
  .harvest { margin-top:16px; border:1px dashed var(--border); background:transparent; color:var(--accent); border-radius:6px; padding:7px 12px; cursor:pointer; font:inherit; width:100%; }
</style>
