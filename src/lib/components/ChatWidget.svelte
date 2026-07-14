<script lang="ts">
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import X from 'lucide-svelte/icons/x';
  import Send from 'lucide-svelte/icons/send';
  import { chatOpen, chatMessages, chatBusy, aiToken, sendChat, openConfig } from '../stores';
  import ChatMessage from './ChatMessage.svelte';

  let text = $state('');

  function submit() {
    const t = text.trim();
    if (!t || $chatBusy) return;
    text = '';
    sendChat(t);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }
</script>

{#if !$chatOpen}
  <button class="fab" aria-label="open chat" onclick={() => chatOpen.set(true)}>
    <MessageSquare size={22} />
  </button>
{:else}
  <div class="panel">
    <header>
      <span>AI Assistant</span>
      <button class="x" aria-label="close chat" onclick={() => chatOpen.set(false)}><X size={18} /></button>
    </header>
    <div class="log">
      {#if !$aiToken}
        <p class="notice">Add your OpenAI token to start —
          <button class="link" onclick={openConfig}>open Config</button>.</p>
      {/if}
      {#each $chatMessages as m}
        <ChatMessage role={m.role} content={m.content} />
      {/each}
      {#if $chatBusy}<p class="typing">typing…</p>{/if}
    </div>
    <div class="input">
      <textarea placeholder="Ask GPT to fill or generate…" bind:value={text} onkeydown={onKey} rows="1"></textarea>
      <button class="send" aria-label="send" disabled={$chatBusy} onclick={submit}><Send size={18} /></button>
    </div>
  </div>
{/if}

<style>
  .fab { position:fixed; right:20px; bottom:20px; z-index:900; width:52px; height:52px; border-radius:50%;
    border:none; background:var(--accent); color:#fff; box-shadow:0 6px 20px rgba(0,0,0,.25); cursor:pointer;
    display:flex; align-items:center; justify-content:center; }
  .panel { position:fixed; right:20px; bottom:20px; z-index:900; width:min(380px,92vw); height:min(520px,80vh);
    display:flex; flex-direction:column; background:var(--bg); border:1px solid var(--border);
    border-radius:14px; box-shadow:0 12px 40px rgba(0,0,0,.3); overflow:hidden; }
  header { display:flex; justify-content:space-between; align-items:center; padding:10px 14px;
    background:var(--accent); color:#fff; font-weight:600; }
  header .x { border:none; background:transparent; color:#fff; cursor:pointer; }
  .log { flex:1; overflow:auto; padding:12px; display:flex; flex-direction:column; }
  .notice, .typing { color:var(--text-muted); font-size:13px; }
  .link { border:none; background:transparent; color:var(--accent); cursor:pointer; text-decoration:underline; padding:0; }
  .input { display:flex; gap:6px; padding:10px; border-top:1px solid var(--border); }
  .input textarea { flex:1; resize:none; max-height:120px; font:inherit; color:var(--text); background:var(--surface);
    border:1px solid var(--border); border-radius:8px; padding:8px 10px; }
  .send { border:none; background:var(--accent); color:#fff; border-radius:8px; padding:0 12px; cursor:pointer; }
  .send:disabled { opacity:.5; cursor:default; }
</style>
