<script lang="ts">
  import CornerDownLeft from 'lucide-svelte/icons/corner-down-left';
  import Plus from 'lucide-svelte/icons/plus';
  import { getAtPath, type JsonValue } from '../jsonModel';
  import { pathExists } from '../pathUtils';
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import { data, selectedPath, insertAnswer, appendAnswer, undo, canUndo } from '../stores';
  let { role, content }: { role: 'user' | 'assistant'; content: string } = $props();

  const targetIsArray = $derived(
    $data !== null && pathExists($data, $selectedPath)
      && Array.isArray(getAtPath($data, $selectedPath) as JsonValue),
  );
  const hasDoc = $derived($data !== null);
</script>

<div class="msg {role}">
  <div class="bubble">{content}</div>
  {#if role === 'assistant' && content}
    <div class="actions">
      {#if targetIsArray}
        <button class="act" disabled={!hasDoc} onclick={() => appendAnswer(content)}>
          <Plus size={13} /> Append to array
        </button>
        <button class="act" disabled={!hasDoc} onclick={() => insertAnswer(content)}>Replace</button>
      {:else}
        <button class="act" disabled={!hasDoc} onclick={() => insertAnswer(content)}>
          <CornerDownLeft size={13} /> Insert into selected node
        </button>
      {/if}
      <button class="act" disabled={!$canUndo} onclick={undo} title="Undo the last change">
        <Undo2 size={13} /> Revert
      </button>
    </div>
  {/if}
</div>

<style>
  .msg { display:flex; flex-direction:column; gap:3px; margin:6px 0; max-width:85%; }
  .msg.user { align-self:flex-end; align-items:flex-end; }
  .msg.assistant { align-self:flex-start; align-items:flex-start; }
  .bubble { padding:8px 12px; border-radius:12px; white-space:pre-wrap; word-break:break-word; }
  .user .bubble { background:var(--accent); color:#fff; border-bottom-right-radius:4px; }
  .assistant .bubble { background:var(--surface); border:1px solid var(--border); border-bottom-left-radius:4px; }
  .actions { display:flex; gap:8px; }
  .act { display:inline-flex; align-items:center; gap:4px; font-size:11px; border:none; background:transparent;
    color:var(--accent); cursor:pointer; padding:2px 4px; }
  .act:disabled { color:var(--text-muted); cursor:default; }
</style>
