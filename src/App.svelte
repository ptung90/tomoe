<script lang="ts">
  import JsonTableWorkspace from './lib/modules/json-table/Workspace.svelte';
  import Toast from './lib/components/Toast.svelte';
</script>

<div class="app">
  <JsonTableWorkspace />
  <Toast />
</div>

<style>
  .app { height:100vh; display:flex; flex-direction:column; }
</style>
