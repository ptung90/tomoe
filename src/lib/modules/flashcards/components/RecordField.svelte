<script lang="ts">
  import type { SchemaField, LocalizedText } from '../model';
  import { resolveLabel } from '../lib/card-render';
  import RichText from './RichText.svelte';
  import ImageField from './ImageField.svelte';

  let { field, value, locales, activeLocale = 'en', onChange }: {
    field: SchemaField;
    value: LocalizedText;
    locales: string[];
    activeLocale?: string;
    onChange: (val: string, locale?: string) => void;
  } = $props();

  const multilingual = $derived(field.type !== 'image' && field.multilingual !== false);
  function loc(l: string): string {
    return value && typeof value === 'object' ? (value[l] ?? '') : (typeof value === 'string' ? value : '');
  }
  function str(): string { return typeof value === 'string' ? value : ''; }
</script>

<div class="field">
  <span class="field-label">{resolveLabel(field.label, activeLocale, field.key)}</span>

  {#if field.type === 'image'}
    <ImageField value={str()} onChange={(u) => onChange(u)} />
  {:else if multilingual}
    <div class="locales">
      {#each locales as l (l)}
        <div class="loc-row">
          <span class="loc-tag">{l.toUpperCase()}</span>
          {#if field.type === 'text-long'}
            <RichText value={loc(l)} onChange={(md) => onChange(md, l)} />
          {:else}
            <input class="txt" type="text" value={loc(l)}
              oninput={(e) => onChange((e.target as HTMLInputElement).value, l)} />
          {/if}
        </div>
      {/each}
    </div>
  {:else if field.type === 'text-long'}
    <RichText value={str()} onChange={(md) => onChange(md)} />
  {:else}
    <input class="txt" type="text" value={str()}
      oninput={(e) => onChange((e.target as HTMLInputElement).value)} />
  {/if}
</div>

<style>
  .field { display:flex; flex-direction:column; gap:6px; }
  .field-label { font-size:12px; font-weight:600; color:var(--text-muted); }
  .locales { display:flex; flex-direction:column; gap:6px; }
  .loc-row { display:flex; gap:8px; align-items:flex-start; }
  .loc-tag { font-size:11px; font-weight:600; color:var(--accent); padding-top:8px; min-width:24px; }
  .txt { flex:1; padding:7px 9px; border:1px solid var(--border); border-radius:6px;
    background:var(--bg); color:var(--text); font:inherit; }
</style>
