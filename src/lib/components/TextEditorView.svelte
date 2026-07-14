<script lang="ts">
  import { getAtPath, type JsonValue } from '../jsonModel';
  import { data, selectedPath, editValue } from '../stores';
  import { pathExists } from '../pathUtils';
  import { formatNode, validateJson, autoFix } from '../jsonText';

  let draft = $state('');
  let fixError = $state('');

  // (Re)load the draft from the active node when the selection or data changes.
  $effect(() => {
    const p = $selectedPath;
    const d = $data;
    draft = d !== null && pathExists(d, p) ? formatNode(getAtPath(d, p)) : '';
    fixError = '';
  });

  const result = $derived(validateJson(draft));

  function apply() {
    const r = validateJson(draft);
    if (r.ok) editValue($selectedPath, r.value);
  }
  function revert() {
    if ($data !== null && pathExists($data, $selectedPath)) {
      draft = formatNode(getAtPath($data, $selectedPath) as JsonValue);
    }
    fixError = '';
  }
  function fix() {
    const r = autoFix(draft);
    if (r.ok) { draft = formatNode(r.value); fixError = ''; }
    else { fixError = r.error; }
  }
</script>

<div class="text-editor">
  <div class="bar">
    <button class="apply" disabled={!result.ok} onclick={apply}>Apply</button>
    <button onclick={revert}>Revert</button>
    <button disabled={result.ok} onclick={fix}>Auto-fix</button>
    <span class="status">
      {#if result.ok}
        <span class="ok">Valid JSON</span>
      {:else}
        <span class="err">Error: {result.error}{#if result.line} (line {result.line}, col {result.col}){/if}</span>
      {/if}
      {#if fixError}<span class="err"> · Cannot auto-fix: {fixError}</span>{/if}
    </span>
  </div>
  <textarea bind:value={draft} spellcheck="false"></textarea>
</div>

<style>
  .text-editor { display:flex; flex-direction:column; gap:8px; height:100%; min-height:0; }
  .bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .bar button { border:1px solid var(--border); background:var(--surface); color:var(--text);
    border-radius:8px; padding:4px 12px; }
  .bar button:hover:not(:disabled) { border-color:var(--accent); color:var(--accent); }
  .bar button:disabled { opacity:.45; cursor:default; }
  .bar .apply:not(:disabled) { background:var(--accent); border-color:var(--accent); color:#fff; }
  .status { font-size:12px; }
  .ok { color:#2e7d32; }
  .err { color:#c0392b; }
  textarea { flex:1; min-height:200px; width:100%; resize:none; font-family:ui-monospace, monospace;
    font-size:13px; line-height:1.5; color:var(--text); background:var(--surface);
    border:1px solid var(--border); border-radius:8px; padding:10px 12px; }
  textarea:focus { outline:2px solid var(--accent-weak); border-color:var(--accent); }
</style>
