<script lang="ts">
  import { project, setProjectName } from './stores';
  import { dragX } from '../../actions/resize';
  import SchemaRecordList from './components/SchemaRecordList.svelte';
  import RecordDetail from './components/RecordDetail.svelte';
  import SchemaEditorModal from './components/SchemaEditorModal.svelte';
  import CardPreview from './components/CardPreview.svelte';

  let leftWidth = $state(300);
  let rightWidth = $state(360);
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
  </header>
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
  <SchemaEditorModal />
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
  .body { flex:1; display:grid; min-height:0; }
  .left, .right, .preview-pane { min-height:0; min-width:0; }
  .left { background:var(--sidebar); }
  .right { background:var(--bg); }
</style>
