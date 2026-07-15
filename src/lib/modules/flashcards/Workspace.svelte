<script lang="ts">
  import { project, setProjectName, selectRecord } from './stores';
  import { dragX } from '../../actions/resize';
  import SchemaRecordList from './components/SchemaRecordList.svelte';
  import RecordDetail from './components/RecordDetail.svelte';
  import SchemaEditorModal from './components/SchemaEditorModal.svelte';
  import CardEditorModal from './components/CardEditorModal.svelte';
  import CardPreview from './components/CardPreview.svelte';
  import CardGallery from './components/CardGallery.svelte';
  import PrintView from './components/PrintView.svelte';
  import { collectPrintCards } from './lib/printCards';
  import Printer from 'lucide-svelte/icons/printer';

  let leftWidth = $state(300);
  let rightWidth = $state(440);
  let view = $state<'records' | 'cards'>('records');
  const printCount = $derived(collectPrintCards($project).length);
</script>

<div class="workspace">
  <header class="header">
    <input
      class="project-name"
      aria-label="project name"
      value={$project.projectName}
      onchange={(e) => setProjectName((e.target as HTMLInputElement).value.trim() || 'Untitled')}
    />
    <span class="counts">
      {$project.schemas.length} schema{$project.schemas.length === 1 ? '' : 's'} ·
      {$project.records.length} record{$project.records.length === 1 ? '' : 's'}
    </span>
    <div class="view-toggle" aria-label="view">
      <button type="button" aria-pressed={view === 'records'} class:on={view === 'records'}
        onclick={() => (view = 'records')}>Records</button>
      <button type="button" aria-pressed={view === 'cards'} class:on={view === 'cards'}
        onclick={() => (view = 'cards')}>Cards</button>
    </div>
    <button type="button" class="print-btn" disabled={printCount === 0}
      onclick={() => window.print()} title="Print / Export PDF">
      <Printer size={14} /> Print
    </button>
  </header>
  {#if view === 'records'}
    <div class="body" style={`grid-template-columns:${leftWidth}px 6px 1fr 6px ${rightWidth}px`}>
      <div class="left"><SchemaRecordList /></div>
      <div
        class="divider divider-x"
        role="separator"
        aria-orientation="vertical"
        aria-label="resize sidebar"
        use:dragX={(dx) => (leftWidth = Math.max(220, Math.min(560, leftWidth + dx)))}
      ></div>
      <div class="right"><RecordDetail /></div>
      <div
        class="divider divider-x"
        role="separator"
        aria-orientation="vertical"
        aria-label="resize preview"
        use:dragX={(dx) => (rightWidth = Math.max(240, Math.min(720, rightWidth - dx)))}
      ></div>
      <div class="preview-pane"><CardPreview /></div>
    </div>
  {:else}
    <div class="cards-body"><CardGallery onOpen={(id) => { selectRecord(id); view = 'records'; }} /></div>
  {/if}
  <SchemaEditorModal />
  <CardEditorModal />
  <PrintView />
</div>

<style>
  .workspace { flex:1; display:flex; flex-direction:column; min-height:0; background:var(--bg); color:var(--text); }
  .header { display:flex; align-items:center; gap:12px; padding:8px 12px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  .project-name { font-weight:600; font:inherit; color:var(--text); background:transparent;
    border:1px solid transparent; border-radius:6px; padding:3px 7px; min-width:8ch; }
  .project-name:hover { border-color:var(--border); }
  .project-name:focus { outline:none; border-color:var(--accent); background:var(--bg); }
  .counts { color:var(--text-muted); font-size:12px; }
  .view-toggle { margin-left:auto; display:inline-flex; gap:2px; border:1px solid var(--border); border-radius:8px; padding:2px; }
  .view-toggle button { border:none; background:transparent; color:var(--text-muted); font:inherit; font-size:12px;
    padding:3px 12px; border-radius:6px; cursor:pointer; transition:background .12s ease, color .12s ease; }
  .view-toggle button:hover:not(.on) { color:var(--accent); }
  .view-toggle button.on { background:var(--accent); color:#fff; font-weight:600; }
  .view-toggle button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .print-btn { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:4px 10px; font:inherit; font-size:12px; cursor:pointer;
    transition:background .12s ease, color .12s ease; }
  .print-btn:hover:not(:disabled) { background:var(--accent-weak); color:var(--accent); }
  .print-btn:disabled { opacity:.5; cursor:default; }
  .print-btn:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .cards-body { flex:1; min-height:0; }
  .body { flex:1; display:grid; min-height:0; }
  .left, .right, .preview-pane { min-height:0; min-width:0; }
  .left { background:var(--sidebar); }
  .right { background:var(--bg); }

  /* Resize handles between panes. The 6px column is the grab zone (widened to
     ~12px via ::before); a 1px hairline sits centered and thickens to accent on hover/drag. */
  .divider { position:relative; cursor:col-resize; touch-action:none; }
  .divider::before { content:''; position:absolute; top:0; bottom:0; left:-3px; right:-3px; z-index:2; }
  .divider::after {
    content:''; position:absolute; top:0; bottom:0; left:50%; width:1px; transform:translateX(-50%);
    background:var(--border); transition:background .12s ease, width .12s ease;
  }
  .divider:hover::after, .divider:active::after { background:var(--accent); width:3px; }
</style>
