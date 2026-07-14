<script lang="ts">
  import { fly } from 'svelte/transition';
  import Check from 'lucide-svelte/icons/check';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import { toast } from '../modules/json-table/stores';
</script>

{#if $toast}
  <div
    class="toast"
    class:error={$toast.kind === 'error'}
    role="status"
    transition:fly={{ x: 40, duration: 220 }}
  >
    <span class="ico">
      {#if $toast.kind === 'error'}<TriangleAlert size={18} />{:else}<Check size={18} />{/if}
    </span>
    <span class="msg">{$toast.message}</span>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--accent);
    color: #fff;
    border-radius: 12px;
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    z-index: 1000;
  }
  .toast.error { background: #c0392b; }
  .ico { display: flex; align-items: center; }
</style>
