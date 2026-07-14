<script lang="ts">
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import X from 'lucide-svelte/icons/x';
  import { aiConfig, setAiConfig, aiGenerateRecords } from '../stores';
  import { showToast } from '../../../shell';

  let { schemaId, onClose }: { schemaId: string; onClose: () => void } = $props();

  let instruction = $state('');
  let count = $state(10);
  let busy = $state(false);
  let error = $state('');

  const canRun = $derived($aiConfig.apiKey.trim().length > 0 && instruction.trim().length > 0 && !busy);

  async function run() {
    if (!canRun) return;
    busy = true; error = '';
    try {
      const n = await aiGenerateRecords(schemaId, instruction.trim(), count);
      showToast(`Added ${n} record${n === 1 ? '' : 's'}`);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Generation failed';
    } finally { busy = false; }
  }
</script>

<div class="backdrop" role="button" tabindex="-1" aria-label="Close"
  onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}></div>
<div class="modal" role="dialog" aria-modal="true" aria-label="Generate records with AI">
  <header>
    <span class="title"><Sparkles size={15} /> Generate records</span>
    <button type="button" class="close" aria-label="Close" onclick={onClose}><X size={16} /></button>
  </header>

  <label class="field">
    <span>Anthropic API key</span>
    <input type="password" value={$aiConfig.apiKey} placeholder="sk-ant-…"
      oninput={(e) => setAiConfig({ apiKey: (e.currentTarget as HTMLInputElement).value })} />
  </label>

  <label class="field">
    <span>Instruction</span>
    <textarea rows="3" bind:value={instruction} placeholder="e.g. 20 common Japanese verbs with English meaning"></textarea>
  </label>

  <label class="field row">
    <span>Count</span>
    <input type="number" min="1" max="50" bind:value={count} />
  </label>

  {#if error}<p class="err">{error}</p>{/if}

  <div class="actions">
    <button type="button" class="ghost" onclick={onClose}>Cancel</button>
    <button type="button" class="primary" disabled={!canRun} onclick={run}>
      <Sparkles size={13} /> {busy ? 'Generating…' : 'Generate'}
    </button>
  </div>
</div>

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:40; }
  .modal { position:fixed; z-index:41; top:50%; left:50%; transform:translate(-50%,-50%);
    width:min(460px,92vw); background:var(--bg); color:var(--text); border:1px solid var(--border);
    border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.25); padding:16px; display:flex; flex-direction:column; gap:12px; }
  header { display:flex; align-items:center; justify-content:space-between; }
  .title { display:inline-flex; align-items:center; gap:7px; font-weight:600; }
  .close { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:4px; border-radius:6px; }
  .close:hover { background:var(--accent-weak); color:var(--accent); }
  .field { display:flex; flex-direction:column; gap:5px; font-size:12px; color:var(--text-muted); }
  .field.row { flex-direction:row; align-items:center; gap:10px; }
  .field input, .field textarea { font:inherit; color:var(--text); background:var(--sidebar);
    border:1px solid var(--border); border-radius:6px; padding:7px 9px; }
  .field.row input { width:80px; }
  .field textarea { resize:vertical; }
  .field input:focus-visible, .field textarea:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .err { color:#dc2626; font-size:12px; margin:0; }
  .actions { display:flex; justify-content:flex-end; gap:8px; }
  .ghost, .primary { display:inline-flex; align-items:center; gap:6px; border-radius:6px; padding:6px 12px;
    font:inherit; font-size:13px; cursor:pointer; }
  .ghost { border:1px solid var(--border); background:transparent; color:var(--text); }
  .ghost:hover { background:var(--accent-weak); color:var(--accent); }
  .primary { border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:600; }
  .primary:hover:not(:disabled) { opacity:.92; }
  .primary:disabled { opacity:.5; cursor:default; }
  .ghost:focus-visible, .primary:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
