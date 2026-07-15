<script lang="ts">
  import '../lib/card-render.css';
  import { project } from '../stores';
  import { collectPrintSheets, type Sheet } from '../lib/printCards';
  import { buildSheetHTML, getPaperPx } from '../lib/card-render';

  const sheets = $derived(collectPrintSheets($project));
  const paper = (sheet: Sheet) =>
    getPaperPx($project.settings.paperSize, sheet.cards[0]?.orientation || $project.settings.orientation);
</script>

<div class="print-view" aria-hidden="true">
  {#each sheets as sheet, i (i)}
    {@const p = paper(sheet)}
    <div class="print-page" style={`width:${p.w}px;height:${p.h}px;`}>
      {@html buildSheetHTML(sheet.cards, sheet.lay, $project.settings, $project.activeLocale, true)}
    </div>
  {/each}
</div>

<style>
  .print-view { display:none; }
  @media print {
    :global(body:has(.print-view) *) { visibility:hidden !important; }
    .print-view, .print-view :global(*) { visibility:visible !important; }
    .print-view { display:block; position:absolute; top:0; left:0; }
    .print-page { break-after:page; page-break-after:always; overflow:hidden; }
  }
</style>
