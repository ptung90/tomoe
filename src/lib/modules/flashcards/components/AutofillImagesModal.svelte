<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import { autofill } from '../lib/imageAutofill';
  import { searchWikimedia } from '../lib/imageSearch';
  import { project, applyImageAutofill } from '../stores';
  import { showToast } from '../../../shell';
  import type { Schema, RecordItem } from '../model';

  let { records, schema, onClose, search = searchWikimedia }: {
    records: RecordItem[]; schema: Schema; onClose: () => void; search?: typeof searchWikimedia;
  } = $props();

  const textFields = $derived(schema.fields.filter((f) => f.type !== 'image'));
  const imageFields = $derived(schema.fields.filter((f) => f.type === 'image'));

  let queryKey = $state(schema.fields.find((f) => f.type !== 'image')?.key ?? '');
  let imageKey = $state(schema.fields.find((f) => f.type === 'image')?.key ?? '');
  let overwrite = $state(false);
  let running = $state(false);
  let done = $state(0);
  let total = $state(0);

  const withoutImage = $derived(records.filter((r) => {
    const v = r.fields[imageKey];
    return !(typeof v === 'string' && v.trim() !== '');
  }).length);

  async function run() {
    if (running || !queryKey || !imageKey) return;
    running = true; done = 0; total = records.length;
    const res = await autofill(
      records,
      { queryKey, imageKey, overwrite, locale: $project.activeLocale },
      search,
      (d, t) => { done = d; total = t; },
    );
    applyImageAutofill(res.updates.map((u) => ({ recordId: u.recordId, key: imageKey, url: u.url })));
    const skipped = res.skippedHasImage + res.skippedEmptyQuery;
    showToast(`Filled ${res.filled} · skipped ${skipped} · no result ${res.noResult}`);
    running = false;
    onClose();
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <header class="head">
      <span class="title"><WandSparkles size={15} /> Auto-fill images</span>
      <button type="button" class="close" aria-label="close" onclick={onClose}><X size={16} /></button>
    </header>
    <div class="body">
      <label class="row">
        <span>Query field</span>
        <select aria-label="query field" bind:value={queryKey} disabled={running}>
          {#each textFields as f (f.id)}<option value={f.key}>{f.label}</option>{/each}
        </select>
      </label>
      {#if imageFields.length > 1}
        <label class="row">
          <span>Target image field</span>
          <select aria-label="target image field" bind:value={imageKey} disabled={running}>
            {#each imageFields as f (f.id)}<option value={f.key}>{f.label}</option>{/each}
          </select>
        </label>
      {/if}
      <label class="check">
        <input type="checkbox" bind:checked={overwrite} disabled={running} />
        Overwrite existing images
      </label>
      <p class="summary">{records.length} record(s) · {withoutImage} without an image</p>
      {#if running}<p class="progress">{done} / {total}…</p>{/if}
    </div>
    <footer class="foot">
      <button type="button" class="ghost" onclick={onClose} disabled={running}>Cancel</button>
      <button type="button" class="primary" onclick={run} disabled={running || !queryKey || !imageKey}>
        {running ? 'Filling…' : 'Fill images'}
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
  .row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .row span { color:var(--text-muted); font-size:13px; }
  .row select { flex:1; max-width:60%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; }
  .check { display:flex; align-items:center; gap:8px; font-size:13px; }
  .summary { color:var(--text-muted); font-size:12px; margin:0; }
  .progress { color:var(--accent); font-size:13px; margin:0; }
  .foot { display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .foot button { border:1px solid var(--border); border-radius:6px; padding:6px 14px; font:inherit; }
  .ghost { background:transparent; color:var(--text); }
  .primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  .foot button:disabled { opacity:.5; }
</style>
