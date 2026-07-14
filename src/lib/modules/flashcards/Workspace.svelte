<script lang="ts">
  import { project } from './stores';
  import { dragX } from '../../actions/resize';

  let leftWidth = $state(280);
</script>

<div class="workspace">
  <header class="header">
    <span class="project-name">{$project.projectName}</span>
    <span class="counts">
      {$project.schemas.length} schema{$project.schemas.length === 1 ? '' : 's'} ·
      {$project.records.length} record{$project.records.length === 1 ? '' : 's'} ·
      {$project.cards.length} card{$project.cards.length === 1 ? '' : 's'}
    </span>
  </header>
  <div class="body" style={`grid-template-columns:${leftWidth}px 6px 1fr`}>
    <div class="left">
      <p class="placeholder">Schemas &amp; records (coming soon)</p>
    </div>
    <div
      class="divider divider-x"
      role="separator"
      aria-orientation="vertical"
      aria-label="resize sidebar"
      use:dragX={(dx) => (leftWidth = Math.max(180, Math.min(600, leftWidth + dx)))}
    ></div>
    <div class="right">
      <p class="placeholder">Cards (coming soon)</p>
    </div>
  </div>
</div>

<style>
  .workspace { flex:1; display:flex; flex-direction:column; min-height:0; background:var(--bg); color:var(--text); }
  .header { display:flex; align-items:center; gap:12px; padding:8px 12px;
            background:var(--surface); border-bottom:1px solid var(--border); }
  .project-name { font-weight:600; }
  .counts { color:var(--text-muted); font-size:12px; }
  .body { flex:1; display:grid; min-height:0; }
  .left, .right { min-height:0; min-width:0; display:flex; align-items:center; justify-content:center; }
  .left { background:var(--sidebar); }
  .right { background:var(--bg); }
  .placeholder { color:var(--text-muted); font-size:13px; }
</style>
