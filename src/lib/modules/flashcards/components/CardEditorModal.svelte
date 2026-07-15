<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { project, cardEditorOpen, setCardCell } from '../stores';
  import { keyedDebounce } from '../../../debounce';
  import RichText from './RichText.svelte';
  import ImageField from './ImageField.svelte';

  const card = $derived($project.cards.find((c) => c.id === $cardEditorOpen) ?? null);
  // One Card = one record: every card's cells are backed by its source record's fields.
  const cellCount = $derived(card ? card.sections.length : 0);

  const debounced = keyedDebounce(
    (cardId: string, i: number, patch: { label?: string; content?: string }) => setCardCell(cardId, i, patch),
    300,
  );
  function onText(i: number, patch: { label?: string; content?: string }) {
    if (card) debounced.call(`${card.id}|${i}`, card.id, i, patch);
  }
  function onImage(i: number, url: string) { if (card) setCardCell(card.id, i, { image: url }); }

  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const cellLabel = (i: number) => str(card?.sections[i]?.label);
  const cellContent = (i: number) => str(card?.sections[i]?.content);
  const cellImage = (i: number) => card?.images.find((im) => im.slot === i)?.url ?? '';

  function close() { cardEditorOpen.set(null); }

  // Flush pending debounced text edits when closing / switching cards.
  let lastId: string | null = null;
  $effect(() => {
    const id = $cardEditorOpen;
    if (id !== lastId) { debounced.flushAll(); lastId = id; }
  });
</script>

{#if card}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <header class="modal-head">
        <span>Edit card</span>
        <button type="button" aria-label="close" onclick={close}><X size={16} /></button>
      </header>
      <div class="modal-body">
        {#key card.id}
          {#each Array(cellCount) as _, i (i)}
            <div class="cell">
              <span class="cell-title">Card {i + 1}</span>
              <label class="fld"><span class="lbl">Label</span>
                <input value={cellLabel(i)} oninput={(e) => onText(i, { label: (e.target as HTMLInputElement).value })} />
              </label>
              <div class="fld"><span class="lbl">Content</span>
                <RichText value={cellContent(i)} onChange={(md) => onText(i, { content: md })} />
              </div>
              <div class="fld"><span class="lbl">Image</span>
                <ImageField value={cellImage(i)} onChange={(u) => onImage(i, u)} />
              </div>
            </div>
          {/each}
        {/key}
      </div>
      <footer class="modal-foot">
        <span class="spacer"></span>
        <button type="button" class="primary" onclick={close}>Done</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center;
    justify-content:center; z-index:50; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(640px,94vw); max-height:88vh; display:flex; flex-direction:column; }
  .modal-head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px;
    border-bottom:1px solid var(--border); font-weight:600; }
  .modal-head button { border:none; background:transparent; color:var(--text-muted); }
  .modal-body { padding:14px 16px; overflow:auto; display:flex; flex-direction:column; gap:16px; }
  .cell { display:flex; flex-direction:column; gap:8px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; }
  .cell-title { font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--text-muted); }
  .fld { display:flex; flex-direction:column; gap:5px; }
  .lbl { font-size:12px; font-weight:600; color:var(--text-muted); }
  .fld input { padding:7px 9px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; }
  .modal-foot { display:flex; align-items:center; padding:12px 16px; border-top:1px solid var(--border); }
  .spacer { flex:1; }
  .modal-foot .primary { border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:600;
    border-radius:6px; padding:6px 14px; font:inherit; }
</style>
