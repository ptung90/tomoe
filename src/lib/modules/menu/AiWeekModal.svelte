<!-- src/lib/modules/menu/AiWeekModal.svelte -->
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import * as S from './stores';
  import { aiConfig, setAiConfig } from './ai';

  let instruction = $state('Thực đơn 1 tuần cho trường mầm non, món Việt, đa dạng nguyên liệu.');
  let busy = $state(false);
  let panel = $state<HTMLElement>();
  const cfg = aiConfig;

  $effect(() => { panel?.focus(); });

  async function run() {
    busy = true;
    try { await S.aiGenerateCurrentWeek(instruction); S.aiModalOpen.set(false); }
    finally { busy = false; }
  }
  function close() { S.aiModalOpen.set(false); }
</script>

<div class="backdrop" role="presentation" onclick={close}>
  <div class="panel" bind:this={panel} role="dialog" aria-modal="true" aria-label="Sinh thực đơn bằng AI" tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && close()}>
    <header><h2><Sparkles size={16} /> Sinh tuần bằng AI</h2><button class="icon" aria-label="Đóng" onclick={close}><X size={18} /></button></header>
    <label>API key (Anthropic)
      <input type="password" value={$cfg.apiKey} onchange={(e) => setAiConfig({ apiKey: (e.currentTarget as HTMLInputElement).value })} />
    </label>
    <label>Yêu cầu
      <textarea rows="4" bind:value={instruction}></textarea>
    </label>
    <button class="primary" disabled={busy || !$cfg.apiKey} onclick={run}>{busy ? 'Đang sinh…' : 'Sinh thực đơn'}</button>
  </div>
</div>

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:50; }
  .panel { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px; padding:16px 20px; width:min(520px,92vw); }
  header { display:flex; align-items:center; justify-content:space-between; }
  h2 { margin:0; font-size:16px; display:flex; align-items:center; gap:6px; }
  label { display:flex; flex-direction:column; gap:4px; margin-top:12px; font-size:13px; color:var(--text-muted); }
  input, textarea { border:1px solid var(--border); border-radius:6px; padding:7px 9px; background:var(--bg); color:var(--text); font:inherit; }
  .primary { margin-top:14px; background:var(--accent); color:#fff; border:none; border-radius:8px; padding:9px 16px; cursor:pointer; font:inherit; font-weight:600; }
  .primary:disabled { opacity:.5; cursor:default; }
  .icon { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:4px; border-radius:5px; }
</style>
