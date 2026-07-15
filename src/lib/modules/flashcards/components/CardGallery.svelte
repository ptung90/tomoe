<script lang="ts">
  import '../lib/card-render.css';
  import Layers from 'lucide-svelte/icons/layers';
  import FilePlus from 'lucide-svelte/icons/file-plus';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Package from 'lucide-svelte/icons/package';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Upload from 'lucide-svelte/icons/upload';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { project, schemaEditorOpen, cardEditorOpen, packAllForSchema, regenerateCard, deleteCard, applyCardToRecords } from '../stores';
  import { deriveAutoTemplate, recordToCard } from '../cardMapping';
  import { isCardStale, schemaForCard } from '../cardOps';
  import { buildCardHTML, getPaperPx } from '../lib/card-render';
  import { resolveStyle } from '../lib/style';
  import type { RecordItem, Schema, CardTemplate, Card } from '../model';
  import EmptyState from './EmptyState.svelte';

  let { onOpen }: { onOpen: (recordId: string) => void } = $props();

  const THUMB_W = 190;

  // One thumbnail per record: the persisted (packed) card if one exists, else auto-derived.
  const groups = $derived($project.schemas.map((schema) => {
    const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
    const recs = $project.records.filter((r) => r.schemaId === schema.id);
    const packed = $project.cards.filter((c) => c.recordId && recs.some((r) => r.id === c.recordId));
    const packedIds = new Set(packed.map((c) => c.recordId));
    const autoRecs = recs.filter((r) => !packedIds.has(r.id));
    const paper = getPaperPx(template.size || $project.settings.paperSize, template.orientation || $project.settings.orientation);
    const scale = Math.min(1, THUMB_W / paper.w);
    return { schema, template, recs, packed, autoRecs, paper, scale };
  }));

  const totalRecords = $derived($project.records.length);

  function recLabel(rec: RecordItem, schema: Schema): string {
    const f = schema.fields.find((x) => x.type !== 'image');
    if (!f) return '(untitled)';
    const v = rec.fields[f.key];
    const s = v && typeof v === 'object' ? (v[$project.activeLocale] ?? '') : (typeof v === 'string' ? v : '');
    return s.trim() || '(untitled)';
  }
  function caption(rec: RecordItem, schema: Schema): string {
    return recLabel(rec, schema);
  }
  function packedCaption(card: Card): string {
    return (card.title as string)?.trim?.() || 'Card';
  }
  function autoHtml(rec: RecordItem, schema: Schema, template: CardTemplate): string {
    const eff = resolveStyle($project.settings, template?.style);
    return buildCardHTML(recordToCard(rec, schema, template, $project.settings, $project.activeLocale),
                         eff, $project.activeLocale);
  }
  function packedHtml(card: Card): string {
    const schema = schemaForCard($project, card);
    const template = schema ? (schema.cardTemplates[0] ?? deriveAutoTemplate(schema)) : null;
    const eff = resolveStyle($project.settings, template?.style, card.style);
    return buildCardHTML(card, eff, $project.activeLocale); // render the stored snapshot, with resolved style
  }
  async function onApply(cardId: string) {
    if (await confirm("Apply this card's content back to its records? This overwrites the record fields.",
                      { title: 'Apply to records', kind: 'warning' })) {
      applyCardToRecords(cardId);
    }
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
          <span class="count">{g.packed.length + g.autoRecs.length} card{g.packed.length + g.autoRecs.length === 1 ? '' : 's'}</span>
          {#if g.recs.length > 0}
            <button type="button" class="pack-all" onclick={() => packAllForSchema(g.schema.id)}>
              <Package size={13} /> Pack all
            </button>
          {/if}
        </header>

        {#if g.packed.length === 0 && g.autoRecs.length === 0}
          <p class="hint">No records in this schema yet.</p>
        {:else}
          <div class="grid">
            <!-- Persisted packed cards (snapshots) -->
            {#each g.packed as card (card.id)}
              {@const stale = isCardStale(card, $project)}
              {@const edited = !!card.edited}
              <div class="thumb packed">
                <button type="button" class="thumb-open" title={packedCaption(card)}
                  onclick={() => card.recordId && onOpen(card.recordId)}>
                  <div class="thumb-frame" style={`width:${Math.round(g.paper.w * g.scale)}px;height:${Math.round(g.paper.h * g.scale)}px;`}>
                    <div class="thumb-scaler" style={`transform:scale(${g.scale});width:${g.paper.w}px;height:${g.paper.h}px;`}>
                      {@html packedHtml(card)}
                    </div>
                  </div>
                </button>
                <div class="thumb-meta">
                  <span class="badge {edited ? 'edited' : stale ? 'stale' : 'synced'}">{edited ? 'Edited' : stale ? 'Stale' : 'Synced'}</span>
                  <button type="button" class="icon-act" aria-label="edit card" title="Edit card"
                    onclick={() => cardEditorOpen.set(card.id)}><Pencil size={13} /></button>
                  {#if edited}
                    <button type="button" class="icon-act" aria-label="apply to records" title="Apply to records"
                      onclick={() => onApply(card.id)}><Upload size={13} /></button>
                  {/if}
                  {#if stale || edited}
                    <button type="button" class="icon-act" aria-label="regenerate" title="Regenerate from records"
                      onclick={() => regenerateCard(card.id)}><RefreshCw size={13} /></button>
                  {/if}
                  <button type="button" class="icon-act danger" aria-label="delete" title="Delete card"
                    onclick={() => deleteCard(card.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            {/each}
            <!-- Auto-derived cards for records not yet packed -->
            {#each g.autoRecs as rec (rec.id)}
              <button type="button" class="thumb auto" title={caption(rec, g.schema)} onclick={() => onOpen(rec.id)}>
                <div class="thumb-frame" style={`width:${Math.round(g.paper.w * g.scale)}px;height:${Math.round(g.paper.h * g.scale)}px;`}>
                  <div class="thumb-scaler" style={`transform:scale(${g.scale});width:${g.paper.w}px;height:${g.paper.h}px;`}>
                    {@html autoHtml(rec, g.schema, g.template)}
                  </div>
                </div>
                <span class="thumb-cap">{caption(rec, g.schema)}</span>
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
  .pack-all { margin-left:auto; display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:4px 10px; font:inherit; font-size:12px;
    cursor:pointer; transition:background .12s ease, color .12s ease; }
  .pack-all:hover { background:var(--accent-weak); color:var(--accent); }
  .pack-all:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .hint { color:var(--text-muted); font-size:12px; margin:0; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:14px; align-items:start; }

  .thumb { display:flex; flex-direction:column; align-items:center; gap:6px; border:none; background:transparent;
    padding:6px; border-radius:10px; font:inherit; }
  .thumb.auto { cursor:pointer; transition:background .12s ease; }
  .thumb.auto:hover { background:var(--accent-weak); }
  .thumb.auto:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .thumb-open { border:none; background:transparent; padding:0; cursor:pointer; }
  .thumb-frame { flex:none; border-radius:2px; box-shadow:0 1px 2px rgba(0,0,0,.08), 0 6px 18px rgba(0,0,0,.12);
    overflow:hidden; transition:box-shadow .12s ease, transform .12s ease; }
  .thumb.auto:hover .thumb-frame, .thumb.auto:focus-visible .thumb-frame,
  .thumb-open:hover .thumb-frame, .thumb-open:focus-visible .thumb-frame {
    transform:translateY(-2px); box-shadow:0 0 0 2px var(--accent), 0 10px 24px rgba(0,0,0,.20); }
  .thumb-scaler { transform-origin:top left; }
  .thumb-cap { font-size:12px; color:var(--text); max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .thumb-meta { display:flex; align-items:center; gap:6px; }
  .badge { font-size:11px; font-weight:600; border-radius:10px; padding:1px 8px; }
  .badge.synced { color:var(--accent); background:var(--accent-weak); }
  .badge.stale { color:#b45309; background:#fef3c7; }
  .badge.edited { color:#1d4ed8; background:#dbeafe; }
  .icon-act { display:inline-flex; align-items:center; border:1px solid var(--border); background:transparent;
    color:var(--text-muted); border-radius:6px; padding:3px; cursor:pointer; transition:background .12s ease, color .12s ease; }
  .icon-act:hover { background:var(--accent-weak); color:var(--accent); }
  .icon-act.danger:hover { background:#fee; color:#b91c1c; }
  .icon-act:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }

  .cta { border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:600;
    border-radius:6px; padding:6px 14px; font:inherit; font-size:12px; cursor:pointer; }
  .cta:hover { opacity:.92; }
  .cta:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
