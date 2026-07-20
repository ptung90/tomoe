<script lang="ts">
  import '../lib/card-render.css';
  import { project, printSelection } from '../stores';
  import { collectPrintSheets } from '../lib/printCards';
  import { buildSheetHTML, buildPackedSheetHTML } from '../lib/card-render';
  import { applyFlowFit } from '../lib/flow-render';

  const sheets = $derived(collectPrintSheets($project, $printSelection ?? undefined));

  let printViewEl = $state<HTMLDivElement | undefined>(undefined);

  // The print view sits under `.print-view { display:none }` outside of `@media print`, so its
  // pages have no layout box (scrollHeight/clientHeight read 0) until the browser actually
  // switches into print mode. `beforeprint` fires once that switch has happened, so it's the
  // only point where measuring the rendered flow pages is meaningful — mirrors the same
  // measure/scale pass as CardPreview's auto-fit effect, via the shared `applyFlowFit`.
  function fitFlowPages() {
    if (printViewEl) applyFlowFit(printViewEl);
  }

  $effect(() => {
    window.addEventListener('beforeprint', fitFlowPages);
    return () => window.removeEventListener('beforeprint', fitFlowPages);
  });
</script>

<div class="print-view" aria-hidden="true" bind:this={printViewEl}>
  {#each sheets as sheet, i (i)}
    <div class="print-page" style={`width:${sheet.lay.sheetW}px;height:${sheet.lay.sheetH}px;`}>
      {@html sheet.pack
        ? buildPackedSheetHTML(sheet.pack, sheet.lay.sheetW, sheet.lay.sheetH, $project.activeLocale, true)
        : buildSheetHTML(sheet.cards, sheet.lay, sheet.settings, $project.activeLocale, true)}
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
