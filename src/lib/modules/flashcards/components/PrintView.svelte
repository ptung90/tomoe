<script lang="ts">
  import '../lib/card-render.css';
  import { project } from '../stores';
  import { collectPrintSheets } from '../lib/printCards';
  import { buildSheetHTML } from '../lib/card-render';
  import { fitFlowScale } from '../lib/flow-render';

  const sheets = $derived(collectPrintSheets($project));

  // The print view sits under `.print-view { display:none }` outside of `@media print`, so its
  // pages have no layout box (scrollHeight/clientHeight read 0) until the browser actually
  // switches into print mode. `beforeprint` fires once that switch has happened, so it's the
  // only point where measuring the rendered flow pages is meaningful — mirrors the same
  // measure/scale pass as CardPreview's auto-fit effect, reusing `fitFlowScale`.
  function fitFlowPages() {
    for (const inner of document.querySelectorAll<HTMLElement>('.print-page .fc-flow-inner')) {
      const shell = inner.closest<HTMLElement>('.fc-flow');
      if (!shell) continue;
      inner.style.setProperty('--flow-scale', '1');
      const pad = parseFloat(getComputedStyle(shell).paddingTop) || 0;
      const pageInnerH = shell.clientHeight - 2 * pad;
      const scale = fitFlowScale(inner.scrollHeight, pageInnerH);
      inner.style.setProperty('--flow-scale', String(scale));
    }
  }

  $effect(() => {
    window.addEventListener('beforeprint', fitFlowPages);
    return () => window.removeEventListener('beforeprint', fitFlowPages);
  });
</script>

<div class="print-view" aria-hidden="true">
  {#each sheets as sheet, i (i)}
    <div class="print-page" style={`width:${sheet.lay.sheetW}px;height:${sheet.lay.sheetH}px;`}>
      {@html buildSheetHTML(sheet.cards, sheet.lay, sheet.settings, $project.activeLocale, true)}
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
