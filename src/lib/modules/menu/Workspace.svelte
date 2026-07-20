<script lang="ts">
  import * as S from './stores';
  const doc = S.doc;
</script>

<div class="menu-workspace">
  <p>Menu module — {$doc.weeks.length} week(s).</p>
</div>

<style>
  .menu-workspace { flex:1; padding:16px; background:var(--bg); color:var(--text); overflow:auto; }
</style>
