<script lang="ts">
  import '../lib/card-render.css';
  import Layers from 'lucide-svelte/icons/layers';
  import FilePlus from 'lucide-svelte/icons/file-plus';
  import { project, schemaEditorOpen } from '../stores';
  import { deriveAutoTemplate, recordsToCard, cardsPerPage, chunkRecords } from '../cardMapping';
  import { buildCardHTML, getPaperPx } from '../lib/card-render';
  import type { RecordItem, Schema, CardTemplate } from '../model';
  import EmptyState from './EmptyState.svelte';

  let { onOpen }: { onOpen: (recordId: string) => void } = $props();

  const THUMB_W = 190;

  const groups = $derived($project.schemas.map((schema) => {
    const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
    const recs = $project.records.filter((r) => r.schemaId === schema.id);
    const chunks = chunkRecords(recs, cardsPerPage(template.layout));
    const paper = getPaperPx(template.size || $project.settings.paperSize, template.orientation || $project.settings.orientation);
    const scale = Math.min(1, THUMB_W / paper.w);
    return { schema, template, chunks, paper, scale };
  }));

  const totalRecords = $derived($project.records.length);

  function recLabel(rec: RecordItem, schema: Schema): string {
    const f = schema.fields.find((x) => x.type !== 'image');
    if (!f) return '(untitled)';
    const v = rec.fields[f.key];
    const s = v && typeof v === 'object' ? (v[$project.activeLocale] ?? '') : (typeof v === 'string' ? v : '');
    return s.trim() || '(untitled)';
  }
  function caption(chunk: RecordItem[], schema: Schema): string {
    const first = recLabel(chunk[0], schema);
    return chunk.length > 1 ? `${first} +${chunk.length - 1}` : first;
  }
  function cardHtml(chunk: RecordItem[], schema: Schema, template: CardTemplate): string {
    return buildCardHTML(recordsToCard(chunk, schema, template, $project.settings, $project.activeLocale),
                         $project.settings, $project.activeLocale);
  }
</script>

{#if $project.schemas.length === 0}
  {#snippet createAction()}
    <button type="button" class="cta" onclick={() => schemaEditorOpen.set('__new__')}>Create a schema</button>
  {/snippet}
  <EmptyState icon={Layers} title="No cards yet"
    hint="Create a schema and add records — each one shows up here as a card."
    action={createAction} />
{:else if totalRecords === 0}
  <EmptyState icon={FilePlus} title="No records to show"
    hint="Add records in the Records view — they'll appear here as cards." />
{:else}
  <div class="gallery">
    {#each groups as g (g.schema.id)}
      <section class="group">
        <header class="group-head">
          <span class="group-name">{g.schema.name}</span>
          <span class="count">{g.chunks.length} card{g.chunks.length === 1 ? '' : 's'}</span>
        </header>
        {#if g.chunks.length === 0}
          <p class="hint">No records in this schema yet.</p>
        {:else}
          <div class="grid">
            {#each g.chunks as chunk (chunk[0].id)}
              <button type="button" class="thumb" title={caption(chunk, g.schema)} onclick={() => onOpen(chunk[0].id)}>
                <div class="thumb-frame" style={`width:${Math.round(g.paper.w * g.scale)}px;height:${Math.round(g.paper.h * g.scale)}px;`}>
                  <div class="thumb-scaler" style={`transform:scale(${g.scale});width:${g.paper.w}px;height:${g.paper.h}px;`}>
                    {@html cardHtml(chunk, g.schema, g.template)}
                  </div>
                </div>
                <span class="thumb-cap">{caption(chunk, g.schema)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
{/if}

<style>
  .gallery { height:100%; min-height:0; overflow:auto; padding:16px; background:var(--sidebar);
    display:flex; flex-direction:column; gap:20px; }
  .group { display:flex; flex-direction:column; gap:10px; }
  .group-head { display:flex; align-items:center; gap:8px; }
  .group-name { font-weight:600; font-size:13px; color:var(--text); }
  .count { font-size:11px; color:var(--text-muted); background:var(--accent-weak); border-radius:10px; padding:0 7px; }
  .hint { color:var(--text-muted); font-size:12px; margin:0; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:14px; align-items:start; }
  .thumb { display:flex; flex-direction:column; align-items:center; gap:6px; border:none; background:transparent;
    padding:6px; border-radius:10px; cursor:pointer; font:inherit; transition:background .12s ease; }
  .thumb:hover { background:var(--accent-weak); }
  .thumb:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .thumb-frame { flex:none; border-radius:2px; box-shadow:0 1px 2px rgba(0,0,0,.08), 0 6px 18px rgba(0,0,0,.12); overflow:hidden; }
  .thumb-scaler { transform-origin:top left; }
  .thumb-cap { font-size:12px; color:var(--text); max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cta { border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:600;
    border-radius:6px; padding:6px 14px; font:inherit; font-size:12px; cursor:pointer; }
  .cta:hover { opacity:.92; }
  .cta:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
