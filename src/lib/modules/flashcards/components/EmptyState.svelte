<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Icon as IconType } from 'lucide-svelte';
  // Accepts any lucide-svelte icon component.
  let { icon: Icon, title, hint, action }: {
    icon?: typeof IconType;
    title: string;
    hint?: string;
    action?: Snippet;
  } = $props();
</script>

<div class="empty">
  {#if Icon}<div class="empty-icon"><Icon size={26} /></div>{/if}
  <p class="empty-title">{title}</p>
  {#if hint}<p class="empty-hint">{hint}</p>{/if}
  {#if action}<div class="empty-action">{@render action()}</div>{/if}
</div>

<style>
  .empty {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 6px; padding: 32px 24px; text-align: center;
  }
  .empty-icon {
    display: flex; align-items: center; justify-content: center;
    width: 48px; height: 48px; margin-bottom: 4px;
    border-radius: 12px; color: var(--accent);
    background: var(--accent-weak);
  }
  .empty-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--text); }
  .empty-hint { margin: 0; font-size: 12px; color: var(--text-muted); max-width: 30ch; line-height: 1.45; }
  .empty-action { margin-top: 10px; }
</style>
