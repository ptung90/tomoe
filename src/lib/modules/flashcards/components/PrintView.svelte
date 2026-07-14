<script lang="ts">
  import '../lib/card-render.css';
  import { project } from '../stores';
  import { collectPrintCards } from '../lib/printCards';
  import { buildCardHTML, getPaperPx } from '../lib/card-render';
  import type { Card } from '../model';

  const cards = $derived(collectPrintCards($project));
  const paper = (card: Card) => getPaperPx($project.settings.paperSize, card.orientation || $project.settings.orientation);
</script>

<div class="print-view" aria-hidden="true">
  {#each cards as card (card.id)}
    {@const p = paper(card)}
    <div class="print-page" style={`width:${p.w}px;height:${p.h}px;`}>
      {@html buildCardHTML(card, $project.settings, $project.activeLocale)}
    </div>
  {/each}
</div>

<style>
  .print-view { display:none; }
  @media print {
    :global(body *) { visibility:hidden !important; }
    .print-view, .print-view :global(*) { visibility:visible !important; }
    .print-view { display:block; position:absolute; top:0; left:0; }
    .print-page { break-after:page; page-break-after:always; overflow:hidden; }
  }
</style>
