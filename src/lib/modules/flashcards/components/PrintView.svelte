<script lang="ts">
  import '../lib/card-render.css';
  import { project } from '../stores';
  import { collectPrintSheets } from '../lib/printCards';
  import { buildSheetHTML } from '../lib/card-render';

  const sheets = $derived(collectPrintSheets($project));
</script>

<div class="print-view" aria-hidden="true">
  {#each sheets as sheet, i (i)}
    <div class="print-page" style={`width:${sheet.lay.sheetW}px;height:${sheet.lay.sheetH}px;`}>
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
