<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Download from 'lucide-svelte/icons/download';
  import { embedImages, remoteImageRefs, urlToDataUrl } from '../lib/embedImages';
  import { applyImageAutofill } from '../stores';
  import { showToast } from '../../../shell';
  import type { Schema, RecordItem } from '../model';

  // `toDataUrl` is injectable so tests can drive the modal without real network fetches.
  let { records, schema, onClose, toDataUrl = urlToDataUrl }: {
    records: RecordItem[]; schema: Schema; onClose: () => void; toDataUrl?: (u: string) => Promise<string>;
  } = $props();

  const imageKeys = $derived(schema.fields.filter((f) => f.type === 'image').map((f) => f.key));
  const pending = $derived(remoteImageRefs(records, imageKeys).length);
  let running = $state(false);
  let done = $state(0);
  let total = $state(0);

  async function run() {
    if (running || pending === 0) return;
    running = true; done = 0; total = pending;
    const res = await embedImages(records, imageKeys, toDataUrl, (d, t) => { done = d; total = t; });
    if (res.updates.length) applyImageAutofill(res.updates);
    showToast(
      res.failed ? `Embedded ${res.embedded} · failed ${res.failed}` : `Embedded ${res.embedded} image(s)`,
      res.failed ? 'error' : 'success',
    );
    running = false;
    onClose();
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <header class="head">
      <span class="title"><Download size={15} /> Embed image URLs</span>
      <button type="button" class="close" aria-label="close" onclick={onClose}><X size={16} /></button>
    </header>
    <div class="body">
      <p class="summary">
        Downloads every remote image URL in this schema and stores it as base64 (offline-safe, prints without a network).
      </p>
      <p class="summary">{pending} image URL(s) to embed · {records.length} record(s)</p>
      {#if running}<p class="progress">{done} / {total}…</p>{/if}
    </div>
    <footer class="foot">
      <button type="button" class="ghost" onclick={onClose} disabled={running}>Cancel</button>
      <button type="button" class="primary" onclick={run} disabled={running || pending === 0}>
        {running ? 'Embedding…' : 'Embed images'}
      </button>
    </footer>
  </div>
</div>

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:60; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(440px,94vw); display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); }
  .title { display:inline-flex; align-items:center; gap:8px; font-weight:600; }
  .close { border:none; background:transparent; color:var(--text-muted); }
  .body { padding:14px; display:flex; flex-direction:column; gap:12px; }
  .summary { color:var(--text-muted); font-size:12px; margin:0; }
  .progress { color:var(--accent); font-size:13px; margin:0; }
  .foot { display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .foot button { border:1px solid var(--border); border-radius:6px; padding:6px 14px; font:inherit; }
  .ghost { background:transparent; color:var(--text); }
  .primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  .foot button:disabled { opacity:.5; }
</style>
