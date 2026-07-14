<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { aiToken, aiModel, configOpen, setAiConfig, closeConfig } from '../stores';

  let token = $state('');
  let model = $state('gpt-4o-mini');
  let show = $state(false);
  $effect(() => { if ($configOpen) { token = $aiToken; model = $aiModel || 'gpt-4o-mini'; } });

  function save() { setAiConfig(token.trim(), model.trim() || 'gpt-4o-mini'); closeConfig(); }
  function clear() { token = ''; }
</script>

{#if $configOpen}
  <div class="backdrop" role="button" tabindex="-1" aria-label="close"
    onclick={closeConfig} onkeydown={(e) => e.key === 'Escape' && closeConfig()}></div>
  <div class="dialog" role="dialog" aria-label="AI configuration">
    <header>
      <span>AI Settings</span>
      <button class="x" aria-label="close" onclick={closeConfig}><X size={18} /></button>
    </header>
    <label for="tok">OpenAI token</label>
    <div class="row">
      <input id="tok" type={show ? 'text' : 'password'} bind:value={token} placeholder="sk-..." />
      <button onclick={() => (show = !show)}>{show ? 'Hide' : 'Show'}</button>
    </div>
    <label for="mdl">Model</label>
    <input id="mdl" type="text" bind:value={model} placeholder="gpt-4o-mini" list="models" />
    <datalist id="models"><option value="gpt-4o-mini"></option><option value="gpt-4o"></option></datalist>
    <footer>
      <button onclick={clear}>Clear</button>
      <button class="save" onclick={save}>Save</button>
    </footer>
    <p class="hint">Stored locally on this machine only.</p>
  </div>
{/if}

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:1000; border:none; }
  .dialog { position:fixed; z-index:1001; top:50%; left:50%; transform:translate(-50%,-50%);
    width:min(460px,92vw); background:var(--surface); color:var(--text); border:1px solid var(--border);
    border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.35); padding:16px; display:flex; flex-direction:column; gap:8px; }
  header { display:flex; justify-content:space-between; align-items:center; font-weight:600; margin-bottom:4px; }
  .x { border:none; background:transparent; color:var(--text-muted); cursor:pointer; }
  label { font-size:12px; color:var(--text-muted); margin-top:6px; }
  .row { display:flex; gap:6px; }
  .row input { flex:1; }
  footer { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
  footer .save { background:var(--accent); border-color:var(--accent); color:#fff; }
  footer button, .row button { border:1px solid var(--border); border-radius:8px; padding:5px 14px;
    background:var(--surface); color:var(--text); cursor:pointer; }
  .hint { font-size:11px; color:var(--text-muted); margin-top:8px; }
</style>
