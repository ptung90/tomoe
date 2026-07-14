<script lang="ts">
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import { editValue } from '../stores';
  import { isLongText } from '../textUtils';

  let { value, path, compact = false }: { value: JsonValue; path: Path; compact?: boolean } = $props();
  const kind = $derived(classify(value));
  // A roomy textarea for long/multiline strings — but not in compact (table) contexts.
  const multiline = $derived(!compact && isLongText(value));

  const onStr = (e: Event) => editValue(path, (e.target as HTMLInputElement | HTMLTextAreaElement).value);
  const onNum = (e: Event) => {
    const n = Number((e.target as HTMLInputElement).value);
    editValue(path, Number.isNaN(n) ? 0 : n);
  };
  const onBool = (e: Event) => editValue(path, (e.target as HTMLInputElement).checked);

  // Auto-grow a textarea to fit its content.
  function autogrow(node: HTMLTextAreaElement) {
    const resize = () => { node.style.height = 'auto'; node.style.height = `${node.scrollHeight}px`; };
    resize();
    node.addEventListener('input', resize);
    return { destroy() { node.removeEventListener('input', resize); } };
  }
</script>

{#if kind === 'string'}
  {#if multiline}
    <textarea use:autogrow value={value as string} oninput={onStr} rows="1"></textarea>
  {:else}
    <input type="text" value={value as string} oninput={onStr} />
  {/if}
{:else if kind === 'number'}
  <input type="number" value={value as number} oninput={onNum} />
{:else if kind === 'boolean'}
  <input type="checkbox" checked={value as boolean} onchange={onBool} />
{:else if kind === 'null'}
  <input type="text" placeholder="null" value="" oninput={onStr} class="null-input" />
{/if}

<style>
  input[type="text"], input[type="number"] { width: 100%; min-width: 8rem; }
  textarea { width: 100%; min-width: 8rem; resize: vertical; overflow: hidden;
    display: block; line-height: 1.4; font: inherit; color: var(--text); background: var(--surface);
    border: 1px solid var(--border); border-radius: 6px; padding: 3px 8px; }
  textarea:focus { outline: 2px solid var(--accent-weak); border-color: var(--accent); }
  .null-input::placeholder { color: var(--text-muted); font-style: italic; }
</style>
